import Bull from 'bull';
import { ObjectId } from 'mongodb';
import { writeFile } from 'node:fs/promises';
import imageThumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const THUMBNAILS_WIDTH = [500, 250, 100];

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  if (!job.data.fileId) {
    throw new Error('Missing fileId');
  }

  if (!job.data.userId) {
    throw new Error('Missing userId');
  }

  const filesCollection = dbClient.db.collection('files');

  const file = await filesCollection.findOne({
    userId: new ObjectId(job.data.userId),
    _id: new ObjectId(job.data.fileId),
  });

  if (!file) {
    throw new Error('File not found');
  }

  try {
    /* eslint-disable no-await-in-loop */
    for (const currentWidth of THUMBNAILS_WIDTH) {
      const options = { width: currentWidth };

      const thumbnail = await imageThumbnail(
        file.localPath,
        options,
      );

      await writeFile(
        `${file.localPath}_${currentWidth}`,
        thumbnail,
      );
    }
    /* eslint-disable no-await-in-loop */
  } catch (err) {
    console.error(`${err}`);
  }
});

fileQueue.on('failed', (job, err) => {
  console.error(`${err}`);
});
