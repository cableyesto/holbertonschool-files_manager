import express from 'express';
import { loadEnvFile } from 'node:process';
import router from './routes/index';

loadEnvFile();
const app = express();
app.use(express.json());

const port = process.env.PORT || 5000;

app.use('/', router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
