import http from 'node:http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedAll } from './utils/seed.js';
import { initSocket } from './socket/index.js';
import app from './app.js';
import Outcome from './models/Outcome.js';
import { sweepOrphans } from './utils/uploads.js';

// A bug in one handler should be logged, not end the process for everyone.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

// Clears out uploaded images no outcome ended up using, now and every 6 hours.
const sweep = () => sweepOrphans((file) => Outcome.exists({ 'images.file': file }))
  .catch((err) => console.error('Upload clean-up failed:', err));

connectDB(env.mongoUri)
  .then(seedAll)
  .then(() => {
    sweep();
    setInterval(sweep, 6 * 60 * 60 * 1000).unref();
  })
  .catch((err) => console.error('Startup task failed:', err));
