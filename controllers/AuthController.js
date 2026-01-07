import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export const getConnect = async (req, res) => {
  // Access the Authorization part in the header
  const headerAuth = req.get('Authorization');
  const base64Req = headerAuth.split('Basic ')[1];

  // Decode base64 encoding
  let decodedStr;
  try {
    decodedStr = Buffer.from(base64Req, 'base64').toString('utf-8');
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Separate the string
  const [email, password] = decodedStr.split(':');
  if (!email || !password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hashedPassword = crypto
    .createHash('sha1')
    .update(password)
    .digest('hex');

  // Find the user based on credentials
  const usersCollection = dbClient.db.collection('users');
  const user = await usersCollection.findOne({ email, password: hashedPassword });

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = uuidv4();
  const keyName = `auth_${token}`;
  const tokenDuration = 24 * 3600; // 24h

  await redisClient.set(keyName, user._id.toString(), tokenDuration);
  return res.status(200).json({ token });
};

export const getDisconnect = async (req, res) => {
  // Access the X-Token part in the header
  const token = req.get('X-Token');

  // Find the user based on token
  const keyName = `auth_${token}`;
  const userId = await redisClient.get(keyName);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await redisClient.del(keyName);
  return res.sendStatus(204);
};
