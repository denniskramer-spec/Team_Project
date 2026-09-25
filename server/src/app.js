import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { dbState } from './config/db.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import navRoutes from './routes/nav.js';
import userRoutes from './routes/users.js';
import memberRoutes from './routes/members.js';
import instructionRoutes from './routes/instructions.js';
import chatRoutes from './routes/chat.js';
import reportRoutes from './routes/reports.js';
import planRoutes from './routes/plans.js';
import taskRoutes from './routes/tasks.js';
import incomeRoutes from './routes/incomes.js';
import outcomeRoutes from './routes/outcomes.js';
import financeRoutes from './routes/finance.js';
import checkoutRoutes from './routes/checkout.js';
import assetRoutes from './routes/assets.js';

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: dbState(), time: new Date().toISOString() });
});

// Fail fast instead of letting requests hang while MongoDB is unreachable.
app.use('/api', (req, res, next) => {
  if (dbState() !== 'connected') {
    return res.status(503).json({ message: 'Database is unavailable, please try again shortly' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/users', userRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/instructions', instructionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/outcomes', outcomeRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/assets', assetRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: `${Object.keys(err.keyValue || {}).join(', ')} already exists` });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? 'Server error' : err.message });
});

export default app;
