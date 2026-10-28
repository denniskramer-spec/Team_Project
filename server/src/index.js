// First: the data layer's audit hooks must exist before any model is compiled.
import './utils/auditPlugin.js';
import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedAll } from './utils/seed.js';
import { initSocket, getIO } from './socket/index.js';
import app from './app.js';
import { sweepOrphans } from './utils/uploads.js';
import { fileInUse } from './utils/fileRefs.js';
import { loadFees } from './utils/payments.js';
import { loadSettings } from './routes/settings.js';
import { scheduleFeeRefresh } from './utils/feeRefresh.js';
import { loadRates, scheduleRateRefresh } from './utils/exchange.js';

// A bug in one handler should be logged, not end the process for everyone.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

// Clears out uploaded images no record ended up using, now and every hour.
const sweep = () => sweepOrphans(fileInUse)
  .catch((err) => console.error('Upload clean-up failed:', err));

connectDB(env.mongoUri)
  .then(loadSettings) // before anything asks which day it is
  .then(seedAll)
  .then(loadFees)
  .then(loadRates)
  .then(() => {
    scheduleFeeRefresh();
    scheduleRateRefresh();
    sweep();
    setInterval(sweep, 60 * 60 * 1000).unref();
  })
  .catch((err) => console.error('Startup task failed:', err));

// Stopping (a deploy, Ctrl-C): no new connections; open requests finish and
// sockets are dropped; the database connection is closed; then exit. Ten
// seconds at most, whatever is still hanging.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  const done = () => mongoose.disconnect().catch(() => {}).finally(() => process.exit(0));
  const io = getIO();
  if (io) io.close(done); else server.close(done);
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10 * 1000).unref();
}
['SIGTERM', 'SIGINT'].forEach((signal) => process.once(signal, () => shutdown(signal)));
