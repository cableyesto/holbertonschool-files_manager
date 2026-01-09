import express from 'express';
import router from './routes/index';

const app = express();
app.use(express.json({ limit: '50mb' }));

const port = process.env.PORT || 5000;

app.use('/', router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
