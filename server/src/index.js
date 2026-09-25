import http from 'node:http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedAll } from './utils/seed.js';
import { initSocket } from './socket/index.js';
import app from './app.js';

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

connectDB(env.mongoUri)
  .then(seedAll)
  .catch((err) => console.error('Startup task failed:', err));
