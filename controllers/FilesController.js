import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const FILE_TYPE = new Set([
  'folder',
  'file',
  'image',
]);
const DEFAULT_PATH = '/tmp/files_manager';

const postUpload = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // User authentication
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
    // Verification of send data
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
    let file;
    if (filePayload.parentId && filePayload.parentId !== '0') {
      file = await filesCollection.findOne({ _id: new ObjectId(filePayload.parentId) });
      if (!file) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (file.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    try {
      // Base path
      const path = process.env.FOLDER_PATH || DEFAULT_PATH;
      const folderPath = file ? file.localPath : path;

      // Ensure folder exists
      await mkdir(folderPath, { recursive: true });

      // Create folder or file path
      const localPath = `${folderPath}/${uuidv4()}`;

      if (filePayload.type === 'folder') {
        // Just create the folder on disk
        await mkdir(localPath, { recursive: true });

        // Insert in DB with parentId always '0'
        const folderInserted = await filesCollection.insertOne({
          userId: user._id,
          name: filePayload.name,
          type: filePayload.type,
          parentId: '0',
        });

        return res.status(201).json({
          id: folderInserted.insertedId,
          userId: folderInserted.ops[0].userId,
          name: folderInserted.ops[0].name,
          type: folderInserted.ops[0].type,
          isPublic: false,
          parentId: Number(folderInserted.ops[0].parentId),
        });
      }
      // File or image: write content
      await writeFile(localPath, filePayload.data);

      const fileInserted = await filesCollection.insertOne({
        userId: user._id,
        name: filePayload.name,
        type: filePayload.type,
        parentId: filePayload.parentId || '0',
        isPublic: filePayload.isPublic || false,
        localPath,
      });

      return res.status(201).json({
        id: fileInserted.insertedId,
        userId: fileInserted.ops[0].userId,
        name: fileInserted.ops[0].name,
        type: fileInserted.ops[0].type,
        isPublic: fileInserted.ops[0].isPublic,
        parentId: fileInserted.ops[0].parentId,
      });
    } catch (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } catch (error) {
    console.error('Error retrieving user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default postUpload;
