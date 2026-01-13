import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
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
      parentFolder = await filesCollection.findOne({ _id: new ObjectId(filePayload.parentId) });

      if (!parentFolder) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFolder.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const basePath = process.env.FOLDER_PATH || DEFAULT_PATH;
    let folderPath = basePath;

    if (parentFolder) {
      // For folders inside folders, store inside a subfolder named by parent ID
      folderPath = `${basePath}/${parentFolder._id.toString()}`;
    }

    await mkdir(folderPath, { recursive: true });

    if (filePayload.type === 'folder') {
      const localPath = `${folderPath}/${uuidv4()}`;
      await mkdir(localPath, { recursive: true });

      const folderInserted = await filesCollection.insertOne({
        userId: user._id,
        name: filePayload.name,
        type: 'folder',
        parentId: parentFolder ? parentFolder._id.toString() : '0',
      });

      const inserted = folderInserted.ops[0];
      return res.status(201).json({
        id: folderInserted.insertedId,
        userId: inserted.userId,
        name: inserted.name,
        type: inserted.type,
        isPublic: false,
        parentId: Number(inserted.parentId),
      });
    }

    // type is 'file' or 'image'
    const localPath = `${folderPath}/${uuidv4()}`;
    await writeFile(localPath, Buffer.from(filePayload.data, 'base64'));

    const fileInserted = await filesCollection.insertOne({
      userId: user._id,
      name: filePayload.name,
      type: filePayload.type,
      parentId: parentFolder ? parentFolder._id : '0',
      isPublic: filePayload.isPublic || false,
      localPath,
    });

    const insertedFile = fileInserted.ops[0];
    return res.status(201).json({
      id: fileInserted.insertedId,
      userId: insertedFile.userId,
      name: insertedFile.name,
      type: insertedFile.type,
      isPublic: insertedFile.isPublic,
      parentId: insertedFile.parentId,
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
