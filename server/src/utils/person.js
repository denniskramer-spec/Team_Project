// People are shown by their username everywhere in the app: in chat, reports,
// plans, finance, instructions, popups and the navigation tree. So wherever
// the API names someone ({ id, name, role }), `name` is the username.
//
// The full name stays on the account. It is sent, next to the username, only
// where accounts themselves are looked after: the member directory, Admin →
// Users & roles, sign-up approvals, the security log, and a person's own
// account.
//
// Load `username` with whoever is going to be named: the full name is only a
// fallback for a record loaded without it.
export const shownName = (user) => user?.username ?? user?.name ?? '';
