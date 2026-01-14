import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { contentType } from 'mime-types';
import path from 'path';
import {
  mkdir,
  writeFile,
  access,
  constants,
} from 'node:fs/promises';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const FILE_TYPE = new Set(['folder', 'file', 'image']);
const DEFAULT_PATH = '/tmp/files_manager';
const MAX_ITEMS = 20;

export const postUpload = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filePayload = req.body;

    if (!filePayload.name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!filePayload.type || !FILE_TYPE.has(filePayload.type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!filePayload.data && filePayload.type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    const filesCollection = dbClient.db.collection('files');

    let parentFolder = null;
    if (filePayload.parentId && filePayload.parentId !== '0') {
      if (!ObjectId.isValid(filePayload.parentId)) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      parentFolder = await filesCollection.findOne({ _id: new ObjectId(filePayload.parentId) });

      if (!parentFolder) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFolder.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const basePath = process.env.FOLDER_PATH || DEFAULT_PATH;
    const parentIdValue = parentFolder ? parentFolder._id : '0';

    if (filePayload.type === 'folder') {
      const folderDoc = {
        userId: user._id,
        name: filePayload.name,
        type: 'folder',
        isPublic: filePayload.isPublic || false,
        parentId: parentIdValue, // 0 ou ObjectId
      };

      const { insertedId } = await filesCollection.insertOne(folderDoc);

      const responseParentId = folderDoc.parentId === '0' ? 0 : folderDoc.parentId.toString();

      return res.status(201).json({
        id: insertedId.toString(),
        userId: folderDoc.userId.toString(),
        name: folderDoc.name,
        type: folderDoc.type,
        isPublic: folderDoc.isPublic,
        parentId: responseParentId,
      });
    }

    await mkdir(basePath, { recursive: true });

    const fileName = uuidv4();
    const localPath = path.join(basePath, fileName);
    await writeFile(localPath, Buffer.from(filePayload.data, 'base64'));

    const fileDoc = {
      userId: user._id,
      name: filePayload.name,
      type: filePayload.type,
      isPublic: filePayload.isPublic || false,
      parentId: parentIdValue, // 0 ou ObjectId
      localPath,
    };

    const { insertedId } = await filesCollection.insertOne(fileDoc);

    const responseParentId = fileDoc.parentId === '0' ? 0 : fileDoc.parentId.toString();

    return res.status(201).json({
      id: insertedId.toString(),
      userId: fileDoc.userId.toString(),
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic: fileDoc.isPublic,
      parentId: responseParentId,
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getShow = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = dbClient.db.collection('files');
    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const file = await filesCollection.findOne({
      userId: user._id,
      _id: new ObjectId(fileId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  } catch (err) {
    console.error('Error getting specific file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getIndex = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Query params
    const queryParentId = req.query.parentId;
    let parentId;
    if (queryParentId) {
      parentId = new ObjectId(queryParentId);
    } else {
      parentId = '0';
    }
    const page = parseInt(req.query.page, 10) || 0;
    const skip = page * MAX_ITEMS;

    const filesCollection = dbClient.db.collection('files');

    const files = await filesCollection
      .aggregate([
        { $match: { userId: user._id, parentId } },
        { $sort: { _id: 1 } },
        { $skip: skip },
        { $limit: MAX_ITEMS },
        {
          $project: {
            _id: 0, // remove _id
            id: '$_id',
            userId: '$userId',
            name: '$name',
            type: '$type',
            isPublic: '$isPublic',
            parentId: '$parentId',
          },
        },
      ])
      .toArray();

    return res.status(200).json(files);
  } catch (err) {
    console.error('Error listing files:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const putPublish = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = dbClient.db.collection('files');
    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const fileFound = await filesCollection.findOne({
      userId: user._id,
      _id: new ObjectId(fileId),
    });

    if (!fileFound) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const file = await filesCollection.aggregate([
      { $match: { _id: new ObjectId(fileId) } },
      {
        $project: {
          _id: 0, // remove _id
          id: '$_id',
          userId: '$userId',
          name: '$name',
          type: '$type',
          isPublic: '$isPublic',
          parentId: '$parentId',
        },
      },
    ]).toArray();

    return res.status(200).json(file[0]);
  } catch (err) {
    console.error('Error making public file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const putUnpublish = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = dbClient.db.collection('files');
    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const fileFound = await filesCollection.findOne({
      userId: user._id,
      _id: new ObjectId(fileId),
    });

    if (!fileFound) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const file = await filesCollection.aggregate([
      { $match: { _id: new ObjectId(fileId) } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          userId: '$userId',
          name: '$name',
          type: '$type',
          isPublic: '$isPublic',
          parentId: '$parentId',
        },
      },
    ]).toArray();

    return res.status(200).json(file[0]);
  } catch (err) {
    console.error('Error making private file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFile = async (req, res) => {
  try {
    const filesCollection = dbClient.db.collection('files');
    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const fileFound = await filesCollection.findOne({
      _id: new ObjectId(fileId),
    });

    if (!fileFound) {
      return res.status(404).json({ error: 'Not found' });
    }

    const token = req.header('X-Token');

    if (fileFound.isPublic === false && !token) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (fileFound.isPublic === false) {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const usersCollection = dbClient.db.collection('users');
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Not the owner of the file
      if (String(fileFound.userId) !== String(user._id)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (fileFound.type === 'folder') {
      return res.status(400).json({ error: 'A folder doesn\'t have content' });
    }

    try {
      await access(fileFound.localPath, constants.F_OK);
    } catch (err) {
      console.error('File does not exist in filesystem');
      return res.status(404).json({ error: 'Not found' });
    }

    const fileMIME = contentType(fileFound.name);
    res.set('Content-Type', fileMIME);
    return res.status(200).sendFile(fileFound.localPath);
  } catch (err) {
    console.error('Error getting file data:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
