import Approvals from './Approvals.jsx';
import UsersRoles from './UsersRoles.jsx';
import Groups from './Groups.jsx';

const PAGES = { approvals: Approvals, users: UsersRoles, groups: Groups };

export default function AdminChannel({ title }) {
  const Page = PAGES[title.key];
  return Page ? <Page /> : null;
}
