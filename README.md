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

```
npm run dev
```

That is all. `scripts/dev-setup.mjs` runs first and takes care of the rest, doing
nothing that is already done:

1. installs the root, server and client dependencies when `node_modules` is missing;
2. creates `server/.env` from `.env.example` with a random `JWT_SECRET` and the
   admin password `admin1234` (change it at first login, or edit the file);
3. starts **MongoDB** on port 27017: the `business-manager-mongo` Docker container
   (mongo:7, created if needed) when the Docker daemon is up, otherwise a local
   `mongod` with its data in `.mongo-data/` (git-ignored). A database that is
   already listening is left alone. `npm run db` runs this step on its own.

Then the API, a watch build of the client and the client start, and the browser
opens **http://localhost:3000**. Ctrl+C stops the app; MongoDB keeps running, like
any database, and is found again next time.

On first start the server creates an **admin** account from `SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD` and the groups **Group1** and **Group2**. The admin must
choose a new password at first login. Note that the Docker container and a local
`mongod` keep separate data: whichever is running when you start is the one used.

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
| **Team leader** | Everything an admin can do (accounts, roles, groups, security), and instructs everyone or any group, reads every report, plan and result. |
| **Boss** | Leads one group: instructs it, writes the group report and plan, manages its members. |
| **Member** | Writes their own reports and plans, registers projects, records income, chats. Sees only their own residents, chat accounts and projects; the Checkout and Member tabs are not shown to members, and their Projects, Residents and Chat accounts are gathered under a **Settings** channel at the foot of the rail, under Chat (see below). |

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
| **Chat** | general · each group · finance | Live chat, typing indicators, unread markers; messages take up to five images (the **+** button, a paste or a drop on the composer) and emoji from a searchable picker |
| **Admin** | Approvals · Users & roles · Groups · Payment fees · Security | Sign-up approvals, role changes, group management, payment method fees, the security log and deleted records (admins and the team leader; bosses see Approvals only) |
| **Settings** (members only) | Account — then Projects · Residents · Chat accounts | The rail is icon-only for every role (the channel's name flies out on hover, and a pill on the left marks the open channel); a member's Settings sits at its foot, with their own things in one place: their account (profile, password, theme, alerts) under *User settings*, and their records under *Your records*, on the same pages the other roles reach from the rail. Old links (`/task`, `/resident`, `/chataccount`) land on the right Settings page for a member. |

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
  **issues / blockers** and the **plan for tomorrow**. The bid report shows **today's
  goals**: the member's weekly plan (or monthly, if there is no weekly one) shared out
  per day, rounded up, and whatever earlier days of that plan fell short by is added
  to today's goal (a goal of 150 with 115 done makes tomorrow's 185; a day without a
  report counts as 0). Doing more than the goal pays the shortfall back; it never
  builds up a credit. The dashboard's day card shows the same goals with a bar each. The hours written on an hourly
  project (or the tasks done on a per-task one) are what the day is worth: price × hours
  or price × tasks, less the project's resident share,
  is what the day **earned**; the part no income record has paid yet is the report's
  **upcoming** amount, due on that day (so it shows in the Finance chart
  for that week and month). It is not income: income is only what Finance records.
  Changing a project's price (or its resident's share) re-prices the unpaid days;
  deleting a project drops its days from the reports; recording income on it settles
  them. Every one of those tells the Dashboard, Plan, Projects, Finance and Checkout
  screens to refresh. The modal saves a **draft** as you
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
  reports of the period (the **income** target is met by what Finance records in the
  period, since a report says what the work is worth and Finance what came in), plus
  the result state the owner sets and a summary meter
  counting Done / In progress / Not done. Same writers as reports; reading follows the
  same hierarchy: leader and admin see all, a boss their group, a member only their own.
- **Checkout** — three charts in one row: **Income**, **Job bids** and **AI training
  bids**, each plan versus result. Income has three bars: **planned** (Plan),
  **reported** (what the daily reports' hours and tasks earned, paid or not; the note
  says how much of it is still upcoming) and **received** (Finance). The per-member
  table adds an **Upcoming** column. Below them sit two panels: the plan-result meter and
  a Projects panel (done / open / price, from the Projects channel). On narrow screens they
  stack. **Every card opens on click** (or Enter) with the records behind its numbers:
  Income lists the plans, the daily reports that earned something (with what is still
  unpaid) and the income records; Job bids and AI training bids list the plans and the
  reports; Plan results lists every plan with its status; Projects lists the projects in
  the period. Each list sorts by any column. It counts personal plans and reports only (a group plan would
  double-count), projects that overlap the period (open-ended ones count until they are done), and income by its date. Refreshes
  live when any source channel changes. Chart colours were checked with the data-viz
  validator against this app's surface; every bar carries its own label and value.
- **Finance** — members record their own income; bosses and the leader record it
  for the people they manage (**Record income**: amount **with its currency**, date, project, resident, payment
  method, note, screenshots; where it came from is the project, else the resident, else the
  method). The amount can be typed in any of the app's currencies (USD, EUR, GBP, CAD,
  AUD, BRL): the picker sits beside the amount, picking a project switches to the
  project's currency, and the form shows what the record will hold in the base currency at
  today's rate. The record keeps both: the base amount (what every total, fee and chart
  works on) and the amount and currency received, with the rate and its day; the income
  table shows "received EUR 92" under the base amount. Income records are history and
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
- **Finance in another currency** — amounts are recorded in the team's base currency
  (USD). The Finance toolbar's **Show in** picker shows every total, chart, tile and
  record in EUR, GBP, CAD, AUD or BRL at the day's rate (the choice is remembered on
  that device). Rates come from the European Central Bank through frankfurter.app, with
  open.er-api.com as a fallback, and refresh on their own: at start-up, every six hours
  while the server runs, and whenever someone asks for rates that are more than a day
  old; a failed refresh keeps the last rates. A note under the toolbar shows the rate in use and when it was
  checked, and admins and the leader can refresh it on the spot
  (`GET /api/finance/rates`, `POST /api/finance/rates/refresh`).
- **Security (Admin → Security)** — admins and the team leader see who accessed the
  team's data, when, from which IP address and device, and what changed. Three parts:
  - The **security log**: every login and failed login (with the username tried and why
    it failed), every look at the data (which list or record, with which filters; the
    same person opening the same thing again within ten minutes is one visit), every
    request that changes data, rate-limited and refused requests, and every look at
    sensitive history (an export, opening or restoring a deleted record). For every
    change the data layer itself writes down each record created, edited or removed,
    with each edited field's old and new value, whichever screen did it (passwords are
    never written). A login from an address the account has never used before is
    flagged **new address**. The log can be filtered (views, changes, deletions,
    restores, logins, failed & refused, admin actions, flagged), searched by name,
    username, address or path, and exported as CSV (the export itself is logged).
  - **Deleted records**: everything anyone deletes — an outcome, a project, a resident,
    a chat account, a message, an instruction, a plan, a report, a group, a rejected
    sign-up — is kept whole first, with who deleted it, when and from where; the data
    layer does this for any delete, so no route can skip it. Its images are kept on
    disk as long as the copy exists. An admin can open the record as it was and
    **restore** it: it goes back under its old id exactly as it was, the copy stays
    and is marked restored (by whom, when), and the restore is logged. A restore is
    refused when a record with that id exists again or the copy was already restored.
  - **Sessions**: end every session of one account on every device (tokens issued before
    that moment stop working and its sockets are dropped), for when an account may be in
    the wrong hands; pair it with a password reset from Users & roles.

  Both collections are append-only: the app has no code path that edits or removes an
  entry, the data layer refuses update and delete operations on them, and nothing in them
  expires. Income records were already unchangeable. The server also sends a
  Content-Security-Policy (only its own scripts and styles run, the page cannot be
  framed), a Permissions-Policy (no camera, microphone or location) and, over HTTPS in
  production, Strict-Transport-Security.
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
- **Chat** — two lists under the Chat channel, like a messenger: **Channels**
  (#general-chat for everyone, a group's chat for that group plus the leader and
  admins, and #finance-chat for bosses and the leader only) and **Direct messages**
  (this person's conversations, newest first, with the other person's avatar and
  presence; **+** starts one with anyone in the directory, and *Message* on a member
  in the side panel does the same). Authors edit their own messages; the leader
  and admins can delete any. **A message in a chat you are not looking at** pops up
  in the bottom-right corner like a messenger (author, chat or *Direct message*, the
  text), with a short sound; clicking it opens that chat. With desktop notifications
  on (Alerts tab), the same arrives as a system notification while the window is in
  the background. The tab title shows the unread count, the Chat channel badge and
  the Direct messages list update live, and the footer's **Messages** link carries
  the unread direct messages. A chat only counts as read while its window is focused:
  what arrives in the background stays unread. The popups can be switched off in the
  Alerts tab (*Message popups*).
- **Older records** still read correctly: a report or plan written before bids were
  split counts as job bids, and a report's old free-text "upcoming" shows as the
  upcoming note.
- **Residents** — a table with one row per resident: photo, name, age, country,
  whether they have a laptop (bought for them, or one they already had) and remote
  access (through their laptop, a VPS or a proxy), when and how the first contact
  happened, and who they belong to. New ones are registered in a form, where the
  country and citizenship are picked from a list with flags. Same role
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
- **Team time zone** — Admin → Team settings (admins and the team leader) picks
  the zone that decides which day is "today" for reports, plans, Finance and
  Checkout, and when the day turns over. Stored dates are calendar days and never
  move. `TEAM_TIME_ZONE` sets it until someone saves one (default UTC).

## Scripts (run from this folder)

| Script | What it does |
|---|---|
| `npm run dev` | Sets up what is missing (dependencies, `.env`, MongoDB), then API (nodemon) + client watch build + client on http://localhost:3000 |
| `npm run db` | Only the set-up step: makes sure MongoDB is running (Docker container or local `mongod`) |
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
| Chat | `GET/POST /api/chat/:title/messages`, `POST /api/chat/:title/upload`, `PATCH/DELETE /api/chat/messages/:id`, `POST /api/chat/:title/read`, `GET /api/chat/unread` |
| Reports | `GET /api/reports`, `GET /api/reports/status`, `GET /api/reports/history`, `PUT /api/reports` (`send: true` sends, otherwise a draft), `DELETE /api/reports/:id` |
| Plans | `GET /api/plans`, `PUT /api/plans`, `PATCH /api/plans/:id/status`, `DELETE /api/plans/:id` |
| Projects | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `GET /api/tasks/:id/log`, `GET /api/tasks/assignees\|residents` |
| Security | `GET /api/security/overview`, `GET /api/security/log`, `GET /api/security/log.csv`, `GET /api/security/deleted`, `GET /api/security/deleted/:id`, `POST /api/security/users/:id/sign-out` (admins and the leader) |
| Finance | `GET/POST /api/incomes`, `POST /api/incomes/upload`, `GET /api/incomes/members`, `GET/POST /api/outcomes`, `PATCH/DELETE /api/outcomes/:id`, `POST /api/outcomes/upload`, `GET /api/outcomes/members`, `GET /api/finance/total`, `GET /api/finance/rates`, `POST /api/finance/rates/refresh`, `GET /api/files/:name` |
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
- **Alerts** — unread instructions and the alarm settings (sound, message popups,
  desktop notifications).

## Project layout

```
server/
  src/config/     env, roles, channel tree, database
  src/models/     User, Group, Instruction, Message, ChatRead, Report, Plan, Task, Income, Outcome, Resident, ChatAccount, PaymentFee, ExchangeRate
  src/routes/     one file per area (see the API table)
  src/socket/     Socket.IO setup, rooms and event helpers
  src/utils/      policies, periods, validation, seeding
  src/scripts/    seedDemo.js
client/
  src/layout/     header, footer + the four sections
  src/channels/   one folder per channel (section 3)
  src/components/ modal, dropdown, toast, avatar, icons, ...
  src/alerts/     instruction alarm and chat message popups (sound, popup, desktop notification)
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
- Sound, message popups and desktop notifications are switched on per person in the
  right-hand panel's **Alerts** tab.
