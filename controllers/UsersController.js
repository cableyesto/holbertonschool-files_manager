import crypto from 'crypto';
import dbClient from '../utils/db';

export const postNew = async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Missing password' });
  }
  try {
    const usersCollection = dbClient.db.collection('users');
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex');

    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      id: result.insertedId,
      email,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req, res) => {
};
