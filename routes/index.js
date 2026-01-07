import express from 'express';
import { getStats, getStatus } from '../controllers/AppController';
import { postNew, getMe } from '../controllers/UsersController';
import { getConnect, getDisconnect } from '../controllers/AuthController';

const router = express.Router();

router.get('/status', getStatus);

router.get('/stats', getStats);

router.post('/users', postNew);

router.get('/connect', getConnect);

router.get('/disconnect', getDisconnect);

router.get('/users/me', getMe);

export default router;
