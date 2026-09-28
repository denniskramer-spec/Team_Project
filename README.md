# Business Manager

A Discord-style team management app: channels down the left, titles in the middle,
content on the right, and a hidden panel that slides in from the right edge.
Built with MERN — MongoDB, Express, React and Node — with Socket.IO for everything
that happens live.

```
Header  ─ user, role badge, live dot, alerts bell
┌───────────┬──────────────┬─────────────────────────────┬──────────┐
│ Channels  │ Titles       │ Content                     │ ▶ Panel  │
│ (section1)│ (section 2)  │ (section 3)                 │ (hidden) │
└───────────┴──────────────┴─────────────────────────────┴──────────┘
```

## Quick start

1. **MongoDB** — the app expects it at the `MONGODB_URI` in `server/.env`.
   This project uses a Docker container:
   `docker start business-manager-mongo` (mongo:7, host port 27018).
2. `cp server/.env.example server/.env` and fill it in (first time only).
3. `npm run install:all`
4. `npm run dev` — starts the API, a watch build of the client, and the client.
5. Open **http://localhost:3000**

On first start the server creates an **admin** account from `SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD` and the groups **Group1** and **Group2**. The admin must
choose a new password at first login.

## Demo data

```
npm run seed:demo             # only when there are no members yet
npm run seed:demo -- --force  # replace the existing demo data
```

Creates a team with instructions, chat, three weeks of reports and plans, tasks and
income, so every channel has something to show. **Password for all of them: `demo1234`.**

| Login | Role |
|---|---|
| `lena` | Team leader — sees everything |
| `bruno` / `bianca` | Boss of Group1 / Group2 |
| `mina`, `omar`, `tess` | Members of Group1 |
| `kai`, `rita` | Members of Group2 |
| `sam` | Waiting for approval (try Admin → Approvals) |

The admin account is left alone, and `--force` only clears the demo collections.

## Roles

| Role | What they do |
|---|---|
| **Admin** | Accounts, roles and groups. Reads everything; writes no reports or plans. |
| **Team leader** | Instructs everyone or any group, reads every report, plan and result. |
| **Boss** | Leads one group: instructs it, writes the group report and plan, manages its members. |
| **Member** | Writes their own reports and plans, signs up tasks, records income, chats. |

**Reading follows the hierarchy:** leader and admin see everything, a boss sees their
own group, a member sees their own records. It is enforced on the server — an
out-of-scope record answers 404, and the channel tree only offers what the role may open.

Capabilities live in `server/src/config/roles.js`; the per-record rules in
`server/src/utils/` (`memberPolicy`, `instructionPolicy`, `reportPolicy`, `chatPolicy`, `visibility`).

## Channels

| Channel | Titles | What it holds |
|---|---|---|
| **Instruction** | All · each group · each member | Instructions from the leader and bosses — to everyone, a group or one person — with read receipts and a live alarm |
| **Report** | All · each group · each member (a member sees "My report") | Daily reports: job bids, AI training bids, income, upcoming amount + note, and a note |
| **Plan** | Weekly/Monthly — then All · each group · each member | Job bid, AI bid and income targets plus a Done / In progress / Not done result |
| **Checkout** | Weekly/Monthly/Yearly — then All · each group · each member | Plan vs report vs actual, drawn from Plan, Report, Task and Finance |
| **Task** | All tasks · each task name | Sign-up: owner, name, period, salary, progress |
| **Assets** | All · each group · each member (a member sees "My assets") | Profiles: name, age, birthday, nationality, contact info, English level — each owned by one member |
| **Member** | All · each group · each member | Directory (with each member's assets in one line); add members, reset passwords, disable accounts |
| **Finance** | Income by month — then All · each group · each member | Income per member: date, amount, source; monthly totals |
| **Chat** | general · each group · finance | Live chat, typing indicators, unread markers |
| **Admin** | Approvals · Users & roles · Groups | Sign-up approvals, role changes, group management |

**The title section is a tree, three levels deep** in the group-scoped channels:
the report type or period (the title), then **All / each group** (`?g=`), then
**the members of that group** (`?m=`). Branches expand on click, and picking a
member narrows the content to that person. Sections are separated by a line.
Instruction has no member level, because instructions go to everyone or to a group.

Channel titles come from `GET /api/nav`, built per user in
`server/src/config/channels.js`. Section 3 components are registered in
`client/src/channels/index.jsx`.

### Notes per channel
- **Instruction** — only the leader and bosses send. The leader reaches everyone, any
  group or any single member; a boss reaches their own group or one of its members.
  Pick a person under a group in the tree and the composer addresses them directly.
  **A direct instruction is private:** only the recipient, its author, and the leader
  and admins can read it — a boss opening one of their members sees the instructions
  they sent themselves, never the leader's. It appears in the recipient's "All" list
  marked **Direct**.
  New instructions raise a sound, an in-window popup and, if allowed, a desktop
  notification; urgent ones keep alarming until acknowledged with "Got it".
  Senders see "Read by N of M" and who is missing.
- **Report** — **daily only**; the titles are simply whose reports to show. The form
  is **job bids**, **AI training bids**, income, **upcoming amount**, **upcoming note**
  and a note (there is no task field — tasks live in the Task channel). Members write their own, bosses also a group
  report, the leader and admins only read. **Nobody can change someone else's report**,
  whatever their role. One report per person, day and scope; saving again updates it.
- **Plan** — **weekly and monthly** (daily plans were removed). The targets are job
  bids, AI training bids and income, matching the report form. Same writers as
  reports, plus the result state, which the owner sets, and a summary meter counting
  Done / In progress / Not done. Reading follows the same hierarchy as reports:
  leader and admin see all, a boss their group, a member only their own.
- **Checkout** — three charts in one row: **Income**, **Job bids** and **AI training
  bids**, each plan versus result. Below them sit two panels: the plan-result meter and
  a Tasks panel (done / open / salary, from the Task channel). On narrow screens they
  stack. It counts personal plans and reports only (a group plan would
  double-count), tasks that overlap the period, and income by its date. Refreshes
  live when any source channel changes. Chart colours were checked with the data-viz
  validator against this app's surface; every bar carries its own label and value.
- **Chat** — general and finance chat are open to every member; a group chat is for
  that group plus the leader and admins. Authors edit their own messages; the leader
  and admins can delete any.
- **Older records** still read correctly: a report or plan written before bids were
  split counts as job bids, and a report's old free-text "upcoming" shows as the
  upcoming note.
- **Assets** — a table with one row per asset: name, age (worked out from the
  birthday), birthday, nationality, contact info, English level and who it belongs to.
  New ones are created in a form. Same role rules as tasks: the leader and admins for
  anyone, a boss for their group, a member for themselves; reading follows the same
  scope. The Member channel shows each member's assets as **one sentence per asset**
  ("Ana Silva, 30 years old, Brazilian, English: Advanced, ana@example.com"), and only
  to people who may see that member's assets.
- **Periods** — ISO weeks in UTC, so `2026-W39` means the same for everyone
  (`server/src/utils/period.js`). Period and group live in the URL, so any view can
  be bookmarked.

## Scripts (run from this folder)

| Script | What it does |
|---|---|
| `npm run dev` | API (nodemon) + client watch build + client on http://localhost:3000 |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Runs the API only |
| `npm test` | Server unit tests (periods, permission rules, outcome splits) |
| `npm run seed:demo` | Fills the database with the demo team (see above) |
| `npm --prefix server run reset-password -- <user>` | Gives one account a temporary password (printed) to change at next login. To set a chosen one, pass it as `RESET_PASSWORD=...` (add `--no-must-change` to keep it) |
| `npm --prefix server run split-legacy-outcomes` | One-off: splits old team costs (outcomes with no member) into one share per member of their group, or of the whole team. Shows the plan; add `-- --apply` to change the data |
| `npm run install:all` | Installs root, server and client dependencies |

## API

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/signup\|login\|logout\|change-password`, `GET /api/auth/me`, `PATCH /api/auth/profile` |
| Members | `GET/POST /api/members`, `PATCH /api/members/:id`, `POST /api/members/:id/status\|reset-password`, `PATCH /api/members/:id/role`, `GET /api/members/pending`, `POST /api/members/:id/approve\|reject` |
| Groups | `GET/POST /api/groups`, `PATCH/DELETE /api/groups/:id`, `GET /api/groups/options` |
| Instructions | `GET/POST /api/instructions`, `PATCH/DELETE /api/instructions/:id`, `POST /api/instructions/:id/read`, `POST /api/instructions/read-all`, `GET /api/instructions/:id/reads`, `GET /api/instructions/unread` |
| Chat | `GET/POST /api/chat/:title/messages`, `PATCH/DELETE /api/chat/messages/:id`, `POST /api/chat/:title/read`, `GET /api/chat/unread` |
| Reports | `GET /api/reports`, `GET /api/reports/history`, `PUT /api/reports`, `DELETE /api/reports/:id` |
| Plans | `GET /api/plans`, `PUT /api/plans`, `PATCH /api/plans/:id/status`, `DELETE /api/plans/:id` |
| Tasks | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `GET /api/tasks/assignees` |
| Finance | `GET/POST /api/incomes`, `PATCH/DELETE /api/incomes/:id`, `GET /api/incomes/members` |
| Checkout | `GET /api/checkout?type=weekly\|monthly\|yearly&period=&group=` |
| Assets | `GET/POST /api/assets`, `PATCH/DELETE /api/assets/:id`, `GET /api/assets/owners` |
| Other | `GET /api/nav`, `GET /api/users/directory`, `GET /api/health` |

Socket.IO events: `presence:*`, `session:changed`, `nav:changed`, `directory:changed`,
`instruction:new\|changed\|deleted`, `chat:new\|changed\|deleted\|typing`,
`report:changed`, `plan:changed`, `task:changed`, `income:changed`.

## Project layout

```
server/
  src/config/     env, roles, channel tree, database
  src/models/     User, Group, Instruction, Message, ChatRead, Report, Plan, Task, Income
  src/routes/     one file per area (see the API table)
  src/socket/     Socket.IO setup, rooms and event helpers
  src/utils/      policies, periods, validation, seeding
  src/scripts/    seedDemo.js
client/
  src/layout/     header + the four sections
  src/channels/   one folder per channel (section 3)
  src/components/ modal, dropdown, toast, avatar, icons, ...
  src/alerts/     instruction alarm (sound, popup, desktop notification)
  src/socket/     socket context and hooks
```

## Notes and troubleshooting

- **Node 20 or newer** — React Router 7 requires it (Vite 6, Mongoose 8 and
  concurrently 8 also run on it).
- **The `#` in the folder path** breaks the Vite dev server (it serves untransformed
  JSX), so `npm run dev` rebuilds the client on each save and serves it with
  `vite preview`. There is no hot reload; refresh after a change (about a second per
  rebuild). Renaming the folder without the `#` lets you use
  `npm --prefix client run dev:hmr` instead.
- **MongoDB 8 will not start on Linux kernel 6.19 or newer** (SERVER-121912), which is
  why the container runs `mongo:7` (`business-manager-mongo`, host port 27018, volume
  `business_manager_mongo_data`).
- If MongoDB is down the API stays up, retries every 5 seconds and answers 503 on
  `/api/*`, so the screen shows a clear message. `GET /api/health` reports both states.
- Changing a password logs out that user's other sessions; disabling an account logs
  them out immediately.
- Sound and desktop notifications for instructions are switched on per person in the
  right-hand panel's **Alerts** tab.
