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
Footer  ─ version, quick links (members, alerts, password), who is online, clock
Theme   ─ dark by default; the sun/moon button in the header switches to light
```

## Quick start

1. **MongoDB** — the app expects it at the `MONGODB_URI` in `server/.env`.
   This project uses a Docker container:
   `docker start business-manager-mongo` (mongo:7, host port 27017).
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
npm run seed:demo -- --force --confirm=<database name>   # DELETES everything first
```

`--force` deletes every account except admins, and all reports, plans, tasks, income,
outcome, chat and instructions. It only runs when `--confirm` names the database it
is about to empty, and never with `NODE_ENV=production`.

Creates a team with instructions, chat, three weeks of reports and plans, tasks and
income, so every channel has something to show. **Password for all of them: `demo1234`.**

| Login | Role |
|---|---|
| `lena` | Team leader — sees everything |
| `bruno` / `bianca` | Boss of Group1 / Group2 |
| `mina`, `omar`, `tess` | Members of Group1 |
| `kai`, `rita` | Members of Group2 |
| `sam` | Waiting for approval (try Admin → Approvals) |

The admin account is left alone.

## Roles

| Role | What they do |
|---|---|
| **Admin** | Accounts, roles and groups. Reads everything; writes no reports or plans. |
| **Team leader** | Instructs everyone or any group, reads every report, plan and result. |
| **Boss** | Leads one group: instructs it, writes the group report and plan, manages its members. |
| **Member** | Writes their own reports and plans, registers projects, records income, chats. Sees only their own residents, chat accounts and projects; the Checkout and Member tabs are not shown to members. |

**Reading follows the hierarchy:** leader and admin see everything, a boss sees their
own group, a member sees their own records. It is enforced on the server — an
out-of-scope record answers 404, and the channel tree only offers what the role may open.

Capabilities live in `server/src/config/roles.js`; the per-record rules in
`server/src/utils/` (`memberPolicy`, `instructionPolicy`, `reportPolicy`, `chatPolicy`, `visibility`).

## Channels

| Channel | Titles | What it holds |
|---|---|---|
| **Instruction** | All · each group · each member | Instructions from the leader and bosses — to everyone, a group or one person — with read receipts and a live alarm |
| **Dashboard** | All · each group · each member (a member sees "My day") | The day at a glance: the member's daily report status, today's plan, projects written; the team's reports for bosses, the leader and admins. The daily report itself is written in a modal |
| **Plan** | Weekly/Monthly — then All · each group · each member | Targets for every daily-report item (applied, AI bids, résumés, forms, bidding hours, income) with achieved / target from the reports, plus a Done / In progress / Not done result |
| **Checkout** | Weekly/Monthly/Yearly — then All · each group · each member | Plan vs report vs actual, drawn from Plan, Report, Projects and Finance |
| **Projects** | All projects · each project name | What each member works on: title, source, the resident it is for, price (per hour, per task, month, fixed...), payment method, start and expiry dates, status, notes — and a day-by-day work log taken from the daily reports |
| **Residents** | All · each group · each member (a member sees "My residents") | People a member is in touch with: photo, name, country, citizenship, age, source, first contact, laptop and remote access, their share of the income (divide %), notes — each owned by one member |
| **Chat accounts** | All · each group · each member (a member sees "My accounts") | The Discord, Telegram and WhatsApp accounts a member uses, the residents they talk to from each, and whether the account is active or suspended (with a screenshot) |
| **Member** | All · each group · each member | Directory (with each member's residents in one line); add members, reset passwords, disable accounts |
| **Finance** | Income · Outcome · Total — then All · each group · each member | Income and outcome per member: date, amount, source or reason; totals per period and group |
| **Chat** | general · each group · finance | Live chat, typing indicators, unread markers |
| **Admin** | Approvals · Users & roles · Groups · Payment fees | Sign-up approvals, role changes, group management, payment method fees |

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
- **Dashboard** — **daily**; the titles are simply whose day to show. A member sees
  their report's status (not written / draft / sent), **today's plan** as a checklist
  (carried over from the previous report's "plan for tomorrow") and which projects
  have today's work written. **Write daily report** opens the report modal: today's
  plan, a **project report** box (text + hours) per active project, a **call report**
  (time, title, profile, caller, went well / mixed / didn't go well, note), the **bid
  report** (applied, AI training bids, résumés tailored, forms filled, time bidding),
  **issues / blockers** and the **plan for tomorrow**. The hours written on an hourly
  project (or the tasks done on a per-task one) are what the day is worth: price × hours
  or price × tasks, less the project's resident share,
  becomes the report's **upcoming** amount, due on that day (so it shows in the Finance chart
  for that week and month). It is not income: income is only what Finance records. The modal saves a **draft** as you
  type and **Send report** sends it; a **Report due** button sits in the corner of every
  screen until today's is sent. A group's report is not written by anyone: it is
  its members' reports of the day added up (sent count, bids, projects
  written, hours, calls, income, and any issues raised). The leader and admins only read. Managers see **one card per member** with the
  report's sections (plan, projects, calls, bids, issues, tomorrow, income) and a Sent / Draft / Missing badge. **Nobody can change someone else's report**,
  whatever their role. One report per person, day and scope.
- **Plan** — **weekly and monthly** (daily plans were removed). The targets mirror the
  measurable items of the daily report: applied, AI training bids, résumés tailored,
  forms filled, time bidding, and income. Every
  plan shows as a card with **achieved / target** per item, added up from the daily
  reports of the period, plus the result state the owner sets and a summary meter
  counting Done / In progress / Not done. Same writers as reports; reading follows the
  same hierarchy: leader and admin see all, a boss their group, a member only their own.
- **Checkout** — three charts in one row: **Income**, **Job bids** and **AI training
  bids**, each plan versus result. Below them sit two panels: the plan-result meter and
  a Projects panel (done / open / price, from the Projects channel). On narrow screens they
  stack. It counts personal plans and reports only (a group plan would
  double-count), projects that overlap the period (open-ended ones count until they are done), and income by its date. Refreshes
  live when any source channel changes. Chart colours were checked with the data-viz
  validator against this app's surface; every bar carries its own label and value.
- **Finance** — members record their own income; bosses and the leader record it
  for the people they manage (**Record income**: amount, date, project, resident, payment
  method, note, screenshots; where it came from is the project, else the resident, else the
  method). Income records are history and
  cannot be changed afterwards (screenshots of the payment can be attached). Each record
  names the project: when one is picked the form shows what its reported work still expects
  to be paid (with a button to use that amount), and recording the income **settles** those
  days, so they stop counting as upcoming on the project and in the chart. It also
  names the **payment method** (PayPal, Payoneer, Wise, USDT, Bitcoin, Upwork, bank wire,
  bank transfer, cash) with its **fee**, which nobody types in: it is the method's current rate from
  **Admin → Payment fees**, where Wise, Bitcoin and USDT fees refresh every day from public
  sources (a Wise quote, mempool.space, CoinGecko) and the rest are kept by an admin or the
  leader from the provider's published pricing and, when the income relates to a **resident**, their share (from the
  resident's divide %): the fee comes off first, then the share, the rest is the member's
  net. The page shows the net total next to the gross one. The income
  chart stacks **upcoming** income on the recorded income: only what the daily reports say
  is due inside the period shown, by its upcoming date. Outcome is recorded by the leader and bosses, with
  at least one image as proof; a team or group outcome is split into one share per member.
- **Totals always add up** — finance and checkout list everyone who has records in
  the period, including an account since disabled ("Tess Novak (disabled)") or a member
  since promoted, and a **No group** tile holds records that belong to no group. Long
  lists show the newest 500 records; totals and charts count all of them.
- **Projects** — the list on the left, one project's details on the right: source,
  the resident it is for, price, when it started and expires, days worked, what the
  reported hours and tasks still expect to be paid (**upcoming**), what income records
  have **paid**, and the **work log**: one row per day, taken from the owner's daily reports. An active
  project with nothing written today is marked **Not written today**, and the owner
  gets a link to their daily report. The API keeps the old name (`/api/tasks`); a
  database from before the change has its salaries renamed to prices and its
  "not done" / "in progress" projects set to active on the first start.
- **Who owns records** — projects, income, outcome, residents and chat accounts belong to
  members and bosses. The leader and admins record them for someone, never for themselves.
- **Moving a member to another group** moves their records with them: the new boss
  sees and manages everything, the old boss no longer does. A boss's group plans and
  group reports stay with the group they were written for.
- **Chat** — general and finance chat are open to every member; a group chat is for
  that group plus the leader and admins. Authors edit their own messages; the leader
  and admins can delete any.
- **Older records** still read correctly: a report or plan written before bids were
  split counts as job bids, and a report's old free-text "upcoming" shows as the
  upcoming note.
- **Residents** — a table with one row per resident: photo, name, age, country,
  whether they have a laptop and remote access, when and how the first contact
  happened, and who they belong to. New ones are registered in a form. Same role
  rules as tasks: the leader and admins for anyone, a boss for their group, a member
  for themselves; reading follows the same scope. The Member channel shows each
  member's residents as **one sentence per resident** ("Ana Silva, 30 years old,
  Brazil, has a laptop, access set up"), and only to people who may see them.
- **Chat accounts** — one card per account: platform (Discord, Telegram or WhatsApp),
  the username, handle or phone number (with a copy button), when it was joined, and
  the residents it talks to, picked from the residents in the same scope. A suspended
  account can carry a screenshot of the suspension screen. Deleting a resident drops
  them from every account's contacts. A database from before this channel existed
  moves its old *assets* into residents on the first start (the old collection is kept
  as `assets_migrated`).
- **Groups** — a group keeps its address (`/chat/group-group1`) when it is renamed, so
  links and bookmarks keep working. Deleting a group leaves its records under "No group".
- **Group reports and plans** — a group has one per period. Any of its bosses can
  write it; the last save wins and names its author.
- **A period belongs to where it starts** — the week of Sep 28 – Oct 4 counts for
  September in Checkout and Finance alike, and the last week of a year for that year.
- **Limits** — per person: 120 changes a minute, 20 chat messages in 10 seconds, 10
  instructions a minute (3 urgent), 10 open tabs or devices. Far above normal use;
  they stop a script or a stuck client from flooding everyone's screen.
- **Periods** — ISO weeks in UTC, so `2026-W39` means the same for everyone
  (`server/src/utils/period.js`). Period and group live in the URL, so any view can
  be bookmarked.

## Scripts (run from this folder)

| Script | What it does |
|---|---|
| `npm run dev` | API (nodemon) + client watch build + client on http://localhost:3000 |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Runs the API; with `NODE_ENV=production` it also serves the built client (see below) |
| `npm test` | Server unit tests (periods, permission rules, outcome splits) |
| `npm run seed:demo` | Fills the database with the demo team (see above) |
| `npm --prefix server run reset-password -- <user>` | Gives one account a temporary password (printed) to change at next login. To set a chosen one, pass it as `RESET_PASSWORD=...` (add `--no-must-change` to keep it) |
| `npm --prefix server run dedupe-group-records` | One-off: keeps the newest group report and group plan per group and period where several bosses each saved one, and updates the database indexes. Shows the plan; add `-- --apply` to change the data |
| `npm --prefix server run split-legacy-outcomes` | One-off: splits old team costs (outcomes with no member) into one share per member of their group, or of the whole team. Shows the plan; add `-- --apply` to change the data |
| `npm run install:all` | Installs root, server and client dependencies |

## Running in production

```
npm run build                      # builds the client into client/dist
NODE_ENV=production npm start      # API + client on PORT (default 5000)
```

One process serves everything. Put it behind HTTPS (the session cookie is marked
`Secure` in production, so it is not sent over plain HTTP) and set `TRUST_PROXY=1`
when a reverse proxy is in front. `CLIENT_ORIGIN` should be the public address.

## API

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/signup\|login\|logout\|change-password`, `GET /api/auth/me`, `PATCH /api/auth/profile` |
| Members | `GET/POST /api/members`, `PATCH /api/members/:id`, `POST /api/members/:id/status\|reset-password`, `PATCH /api/members/:id/role`, `GET /api/members/pending`, `POST /api/members/:id/approve\|reject` |
| Groups | `GET/POST /api/groups`, `PATCH/DELETE /api/groups/:id`, `GET /api/groups/options` |
| Instructions | `GET/POST /api/instructions`, `PATCH/DELETE /api/instructions/:id`, `POST /api/instructions/:id/read`, `POST /api/instructions/read-all`, `GET /api/instructions/:id/reads`, `GET /api/instructions/unread` |
| Chat | `GET/POST /api/chat/:title/messages`, `PATCH/DELETE /api/chat/messages/:id`, `POST /api/chat/:title/read`, `GET /api/chat/unread` |
| Reports | `GET /api/reports`, `GET /api/reports/status`, `GET /api/reports/history`, `PUT /api/reports` (`send: true` sends, otherwise a draft), `DELETE /api/reports/:id` |
| Plans | `GET /api/plans`, `PUT /api/plans`, `PATCH /api/plans/:id/status`, `DELETE /api/plans/:id` |
| Projects | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `GET /api/tasks/:id/log`, `GET /api/tasks/assignees\|residents` |
| Finance | `GET/POST /api/incomes`, `POST /api/incomes/upload`, `GET /api/incomes/members`, `GET/POST /api/outcomes`, `PATCH/DELETE /api/outcomes/:id`, `POST /api/outcomes/upload`, `GET /api/outcomes/members`, `GET /api/finance/total`, `GET /api/files/:name` |
| Checkout | `GET /api/checkout?type=weekly\|monthly\|yearly&period=&group=` |
| Residents | `GET/POST /api/residents`, `PATCH/DELETE /api/residents/:id`, `GET /api/residents/owners`, `POST /api/residents/upload` |
| Chat accounts | `GET/POST /api/chat-accounts`, `PATCH/DELETE /api/chat-accounts/:id`, `GET /api/chat-accounts/owners\|contacts`, `POST /api/chat-accounts/upload` |
| Payments | `GET /api/payments/fees`, `PATCH /api/payments/fees/:key`, `POST /api/payments/fees/refresh` |
| Other | `GET /api/nav`, `GET /api/users/directory`, `GET /api/health` |

Socket.IO events: `presence:*`, `session:changed`, `nav:changed`, `directory:changed`,
`instruction:new\|changed\|deleted`, `chat:new\|changed\|deleted\|typing`,
`report:changed`, `plan:changed`, `task:changed`, `income:changed`, `outcome:changed`,
`resident:changed`, `chatAccount:changed`.

## Side panel

The arrow at the right edge opens a panel with three tabs:

- **Members** — who is online, grouped by role, and when offline people were last seen.
  At the top, a member's **My day** (report status, today's plan to tick off, a button to the
  report) or, for bosses, the leader and admins, **Today's reports** (who has not sent
  today's, with a bell that sends a reminder as a direct message) and **Coming up**
  (birthdays and project expiries in the next two weeks). Clicking a member opens a peek
  card: ID, role, birthday, last seen and, within the usual scope, today's report and
  projects, with a **Message** button.
- **Messages** — direct messages between any two people, with unread counts, typing
  indicators and the same editing rules as the channels (`/api/chat/dm-<userId>/...`,
  `GET /api/chat/dms`).
- **Alerts** — unread instructions and alarm settings.

## Project layout

```
server/
  src/config/     env, roles, channel tree, database
  src/models/     User, Group, Instruction, Message, ChatRead, Report, Plan, Task, Income, Outcome, Resident, ChatAccount
  src/routes/     one file per area (see the API table)
  src/socket/     Socket.IO setup, rooms and event helpers
  src/utils/      policies, periods, validation, seeding
  src/scripts/    seedDemo.js
client/
  src/layout/     header, footer + the four sections
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
  why the container runs `mongo:7` (`business-manager-mongo`, host port 27017, volume
  `business-manager-mongo-data`).
- If MongoDB is down the API stays up, retries every 5 seconds and answers 503 on
  `/api/*`, so the screen shows a clear message. `GET /api/health` reports both states.
- Changing a password logs out that user's other sessions; disabling an account logs
  them out immediately. Logging out also closes that session's live connection.
- Ten wrong passwords lock **that username from that network** for 15 minutes;
  other people on the same network can still log in.
- Uploaded images live in `server/uploads` (or `UPLOADS_DIR`). Images no record uses
  are removed after a day, so each database needs its own folder.
- Sound and desktop notifications for instructions are switched on per person in the
  right-hand panel's **Alerts** tab.
