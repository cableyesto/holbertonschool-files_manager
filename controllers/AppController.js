import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export function getStatus(req, res) {
  const resRedis = redisClient.isAlive();
  const resDB = dbClient.isAlive();
  res.status(200).json({ redis: resRedis, db: resDB });
}

export async function getStats(req, res) {
  const resClient = await dbClient.nbUsers();
  const resFiles = await dbClient.nbFiles();
  res.status(200).json({ users: resClient, files: resFiles });
}
