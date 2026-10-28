import mongoose from 'mongoose';

const RETRY_DELAY_MS = 5000;

// The names the app's own connections give the database. Anything else
// working on the database (a GUI tool, a shell) is "outside the app" and
// gets recorded (utils/outsideWatch.js).
export const APP_NAME = 'business-manager-api';
export const SCRIPT_APP_NAME = 'business-manager-script';
export const APP_NAMES = [APP_NAME, SCRIPT_APP_NAME];

// Hide credentials when logging the connection string.
const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

export async function connectDB(uri, { appName = APP_NAME } = {}) {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  // Keep retrying so the API stays up while the database is unavailable.
  for (;;) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, appName });
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
