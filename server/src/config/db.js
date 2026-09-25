import mongoose from 'mongoose';

const RETRY_DELAY_MS = 5000;

// Hide credentials when logging the connection string.
const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

export async function connectDB(uri) {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  // Keep retrying so the API stays up while the database is unavailable.
  for (;;) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return;
    } catch (err) {
      console.error(`Could not connect to ${redact(uri)}: ${err.message}`);
      console.error(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
export const dbState = () => STATES[mongoose.connection.readyState] ?? 'unknown';
