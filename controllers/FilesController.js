import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const FILE_TYPE = new Set(['folder', 'file', 'image']);
const DEFAULT_PATH = '/tmp/files_manager';

const postUpload = async (req, res) => {
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
      parentId: parentFolder ? parentFolder._id.toString() : '0',
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

export default postUpload;
