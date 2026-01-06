import express from 'express';
import { getStats, getStatus } from '../controllers/AppController';

const router = express.Router();

router.get('/status', getStats);

router.get('/stats', getStatus);

export default router;
