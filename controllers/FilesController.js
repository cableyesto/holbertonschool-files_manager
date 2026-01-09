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
    // Authenticate user
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

    const {
      name,
      type,
      data,
      parentId: rawParentId,
      isPublic = false,
    } = req.body;
    const parentId = rawParentId || '0';

    // Validate payload
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !FILE_TYPE.has(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    const filesCollection = dbClient.db.collection('files');

    let parentFile = null;
    if (parentId !== '0') {
      parentFile = await filesCollection.findOne({ _id: new ObjectId(parentId) });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Base folder path
    const basePath = process.env.FOLDER_PATH || DEFAULT_PATH;
    let folderPath;
    if (parentFile) {
      folderPath = parentFile.localPath;
    } else {
      folderPath = basePath;
    }

    await mkdir(folderPath, { recursive: true });

    const localPath = `${folderPath}/${uuidv4()}`;

    // Handle folder type
    if (type === 'folder') {
      await mkdir(localPath, { recursive: true });

      const folderInserted = await filesCollection.insertOne({
        userId: user._id,
        name,
        type,
        parentId,
        isPublic: false,
        localPath,
      });

      const insertedDoc = folderInserted.ops[0];
      return res.status(201).json({
        id: folderInserted.insertedId,
        userId: insertedDoc.userId,
        name: insertedDoc.name,
        type: insertedDoc.type,
        isPublic: insertedDoc.isPublic,
        parentId: Number(insertedDoc.parentId),
      });
    }

    // Handle file/image type
    const buffer = Buffer.from(data, 'base64');
    await writeFile(localPath, buffer);

    const fileInserted = await filesCollection.insertOne({
      userId: user._id,
      name,
      type,
      parentId,
      isPublic,
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
