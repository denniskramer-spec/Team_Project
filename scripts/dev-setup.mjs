#!/usr/bin/env node
// Everything `npm run dev` needs before the app can start, so one command
// is enough on a fresh machine:
//   1. the root, server and client dependencies (installed when missing)
//   2. server/.env (made from .env.example with a random JWT secret)
//   3. MongoDB on localhost:27017 — the Docker container when Docker is up,
//      otherwise a local `mongod` with its data in .mongo-data/ (git-ignored)
// Nothing is restarted or changed when it is already there.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'business-manager-mongo';
const VOLUME = 'business-manager-mongo-data';
const PORT = 27017;
const say = (msg) => console.log(`[dev] ${msg}`);

const run = (cmd, opts = {}) => spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8', timeout: opts.timeout ?? 20000, ...opts });
const ok = (cmd, opts) => run(cmd, opts).status === 0;

// 1. Dependencies.
for (const dir of ['', 'server', 'client']) {
  const here = path.join(root, dir);
  if (!existsSync(path.join(here, 'node_modules'))) {
    say(`installing ${dir || 'root'} dependencies...`);
    execSync('npm install', { cwd: here, stdio: 'inherit' });
  }
}

// 2. server/.env.
const envFile = path.join(root, 'server', '.env');
if (!existsSync(envFile)) {
  let env = readFileSync(path.join(root, 'server', '.env.example'), 'utf8');
  env = env
    .replace(/^MONGODB_URI=.*$/m, `MONGODB_URI=mongodb://localhost:${PORT}/business_manager`)
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`)
    .replace(/^SEED_ADMIN_PASSWORD=.*$/m, 'SEED_ADMIN_PASSWORD=admin1234');
  writeFileSync(envFile, env);
  say('created server/.env — first login: admin / admin1234 (you will be asked to change it)');
}

// 3. MongoDB.
const portOpen = () => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port: PORT });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.setTimeout(1500, () => { s.destroy(); resolve(false); });
});
const waitForPort = async (seconds) => {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await portOpen()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

if (await portOpen()) {
  say(`MongoDB is already listening on ${PORT}`);
} else {
  let started = false;
  if (ok('docker info', { timeout: 8000 })) {
    const exists = run(`docker ps -a --format '{{.Names}}'`).stdout.split('\n').includes(CONTAINER);
    say(exists ? `starting the ${CONTAINER} container...` : `creating the ${CONTAINER} container (mongo:7)...`);
    started = exists
      ? ok(`docker start ${CONTAINER}`)
      : ok(`docker run -d --name ${CONTAINER} -p ${PORT}:${PORT} -v ${VOLUME}:/data/db mongo:7`, { timeout: 180000 });
    if (started) started = await waitForPort(30);
  }
  if (!started && ok('mongod --version', { timeout: 8000 })) {
    const dataDir = path.join(root, '.mongo-data');
    mkdirSync(dataDir, { recursive: true });
    say(`Docker is not available: starting a local mongod with its data in ${path.relative(root, dataDir)}/`);
    const r = run(`mongod --dbpath "${dataDir}" --port ${PORT} --bind_ip 127.0.0.1 --fork --logpath "${path.join(dataDir, 'mongod.log')}"`, { timeout: 60000 });
    started = r.status === 0 && await waitForPort(30);
    if (!started) console.error(r.stdout, r.stderr);
  }
  if (!started) {
    console.error('[dev] MongoDB could not be started. Start it yourself, then run `npm run dev` again:');
    console.error(`[dev]   docker start ${CONTAINER}      (needs the Docker daemon: sudo systemctl start docker)`);
    console.error('[dev]   or install MongoDB (mongod) locally');
    process.exit(1);
  }
  say(`MongoDB is up on ${PORT}`);
}
