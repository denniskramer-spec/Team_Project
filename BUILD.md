# Building Business Manager, step by step

From an empty computer to the app running for the team. Steps 1–7 get it
running on your own machine; steps 8–12 put it on a server for real use.

The stack: **MongoDB** (database), **Express + Node** (API, `server/`),
**React + Vite** (screens, `client/`), **Socket.IO** (live updates).

---

## Part 1 — On your own computer

### Step 1. Install the tools

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20 or newer (22 is what CI uses) | `node -v` |
| npm | comes with Node | `npm -v` |
| Git | any recent | `git --version` |
| MongoDB | 7 or 8, **or** Docker to run it for you | `mongod --version` / `docker -v` |

You need only one of MongoDB or Docker. With Docker running, the setup step
starts a `mongo:7` container; without it, it uses a local `mongod`.

> MongoDB 8 may refuse to start on Linux kernel 6.19+ (SERVER-121912). If it
> does, use Docker (mongo:7) or install MongoDB 7.

### Step 2. Get the code

```
git clone https://github.com/denniskramer-spec/Team_Project.git
cd Team_Project/"Team APP"
```

### Step 3. Install the dependencies

```
npm run install:all
```

This installs three sets: the root (`concurrently`), `server/` and `client/`.
(`npm run dev` in step 5 also does this if `node_modules` is missing.)

### Step 4. Configure the server

The settings live in `server/.env`. `npm run dev` creates it for you from
`server/.env.example` the first time; to do it by hand:

```
cp server/.env.example server/.env
```

Then fill in:

| Setting | What to put |
|---|---|
| `PORT` | `5000` (the API's port) |
| `MONGODB_URI` | `mongodb://localhost:27017/business_manager` locally |
| `CLIENT_ORIGIN` | `http://localhost:3000` locally; the public address in production |
| `JWT_SECRET` | a long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | the longest a member's login lasts, e.g. `7d` |
| `ADMIN_SESSION_HOURS` | optional; the longest an admin's or team leader's login lasts (default `12`) |
| `SESSION_IDLE_MINUTES` | optional; logged out after this long without use (default `30`) |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | the first admin account (the password must be changed at first login) |
| `TRUST_PROXY` | `0` locally; `1` behind a reverse proxy |
| `UPLOADS_DIR` | optional; where uploaded images go (default `server/uploads`) |
| `TEAM_TIME_ZONE` | optional; e.g. `Europe/Berlin` until an admin sets it in the app |

Never commit `server/.env`; it is git-ignored.

### Step 5. Start everything

```
npm run dev
```

In order, this:

1. runs `scripts/dev-setup.mjs`: installs what is missing, creates `server/.env`
   (admin password `admin1234`), and starts MongoDB on port 27017 as a
   one-member **replica set** `rs0` (Docker container `business-manager-mongo`,
   or a local `mongod` with its data in `.mongo-data/`);
2. builds the client once;
3. runs three processes side by side: the API with nodemon (restarts on server
   changes), a watch build of the client (rebuilds on client changes), and
   `vite preview` on **http://localhost:3000**, which opens in the browser.

There is no hot reload: after a client change, refresh the page. Ctrl+C stops
the app; MongoDB keeps running. `npm run db` starts only the database.

> Why a replica set? The app watches the database for records deleted
> outside the app (a GUI tool, a shell) and keeps copies of them; that needs
> MongoDB's change streams, which only work on a replica set.

### Step 6. Log in and fill it with data

1. Open http://localhost:3000 and log in as `admin` / `admin1234`
   (or what you set in step 4). Choose a new password when asked.
2. Optional, for a full team to click through:

   ```
   npm run seed:demo
   ```

   Every demo account's password is `demo1234`: `lena` (team leader), `bruno`
   and `bianca` (group bosses), `mina`, `omar`, `tess`, `kai`, `rita`
   (members), `sam` (waiting for approval). It runs only on an empty team;
   `-- --force --confirm=<database name>` empties the database first.

Forgot a password? `npm --prefix server run reset-password -- <username>`
prints a temporary one.

### Step 7. Check your work

```
npm test                       # server tests (node --test, server/test/)
npm run build                  # the client must build without errors
```

GitHub runs the same two checks on every push to `main` and every pull
request (`.github/workflows/ci.yml`). Make changes on a branch and merge them
with a pull request once CI is green.

---

## Part 2 — On a server for the team

### Step 8. Prepare the server

A Linux server (Ubuntu 24.04 is fine) with:

- Node.js 22,
- MongoDB 7 running as a replica set (step 9),
- a domain name pointing at the server,
- nginx (or another reverse proxy) for HTTPS.

### Step 9. Set up MongoDB

Run MongoDB as a one-member replica set, with a user and a password:

1. In `/etc/mongod.conf`:

   ```yaml
   replication:
     replSetName: rs0
   security:
     authorization: enabled
   net:
     bindIp: 127.0.0.1
   ```

2. Restart it and, once, in `mongosh`:

   ```js
   rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })
   use admin
   db.createUser({ user: 'bm', pwd: '<strong password>', roles: [{ role: 'readWrite', db: 'business_manager' }, { role: 'dbAdmin', db: 'business_manager' }] })
   ```

   `dbAdmin` lets the app switch on MongoDB's profiler, which is how it
   records work done on the database outside the app (Admin → Security).
   Without it the page says that recording is off.

3. The connection string for step 10:
   `mongodb://bm:<password>@127.0.0.1:27017/business_manager?authSource=admin&replicaSet=rs0`

Keep MongoDB reachable only from the server itself (`bindIp: 127.0.0.1`).

### Step 10. Install and build the app

```
git clone https://github.com/denniskramer-spec/Team_Project.git
cd Team_Project/"Team APP"
npm run install:all
cp server/.env.example server/.env      # then edit it (step 4)
npm run build                           # client -> client/dist
```

In `server/.env` for production: the `MONGODB_URI` from step 9, a new random
`JWT_SECRET`, `CLIENT_ORIGIN=https://your-domain`, `TRUST_PROXY=1`, and an
`UPLOADS_DIR` outside the code folder (e.g. `/var/lib/business-manager/uploads`).

Do **not** run `seed:demo` on the real database.

### Step 11. Run it and keep it running

```
NODE_ENV=production npm start
```

One process now serves both the API and the built client on `PORT` (5000).
To restart it on crashes and reboots, use a systemd service, e.g.
`/etc/systemd/system/business-manager.service`:

```ini
[Unit]
Description=Business Manager
After=network.target mongod.service

[Service]
WorkingDirectory=/opt/Team_Project/Team APP/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
User=bm

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now business-manager`.
`curl localhost:5000/api/health` shows whether the API and database are up.

### Step 12. Put HTTPS in front

The login cookie is marked `Secure` in production, so the app must be reached
over HTTPS. An nginx site, with a certificate from Let's Encrypt (`certbot --nginx`):

```nginx
server {
  server_name your-domain;
  client_max_body_size 20m;              # uploaded images
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Socket.IO (live updates)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Open https://your-domain, log in as the admin, change the password, and set
the team's time zone in **Admin → Team settings**.

---

## Afterwards

- **Updating:** `git pull`, `npm run install:all`, `npm run build`, then
  `sudo systemctl restart business-manager`. Read the release notes first:
  some changes come with a one-off script in `server/src/scripts/`
  (they show a plan first and change data only with `--apply`).
- **Backups:** back up the database (`mongodump --uri "<MONGODB_URI>"`) and the
  `UPLOADS_DIR` folder together, daily, and try a restore now and then.
- **Security:** Admin → Security shows the dangerous events (access to the
  database outside the app, deletions, failed logins, account changes); look
  at it regularly.
- **More detail:** `README.md` describes every channel, role, script and API.
