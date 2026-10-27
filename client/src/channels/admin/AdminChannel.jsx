import Approvals from './Approvals.jsx';
import UsersRoles from './UsersRoles.jsx';
import Groups from './Groups.jsx';
import PaymentFees from './PaymentFees.jsx';
import Security from './Security.jsx';

const PAGES = { approvals: Approvals, users: UsersRoles, groups: Groups, fees: PaymentFees, security: Security };

export default function AdminChannel({ title }) {
  const Page = PAGES[title.key];
  return Page ? <Page /> : null;
}
