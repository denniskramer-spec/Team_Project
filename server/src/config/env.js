import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  // Number of reverse proxies in front of the API (0 = clients connect
  // directly). Only then is X-Forwarded-For trusted for the client's IP,
  // which the login rate limit relies on.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  // Where uploaded images are kept (default: server/uploads). Each database
  // needs its own folder: files no record points to are cleaned up.
  uploadsDir: process.env.UPLOADS_DIR || null,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  seedAdmin: {
    username: process.env.SEED_ADMIN_USERNAME,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
};
