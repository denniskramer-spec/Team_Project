import AccountPage from './AccountPage.jsx';
import TaskChannel from '../task/TaskChannel.jsx';
import ResidentChannel from '../resident/ResidentChannel.jsx';
import ChatAccountChannel from '../chataccount/ChatAccountChannel.jsx';

// Section 3 for a member's Settings channel: their account, and their own
// records (projects, residents, chat accounts) on the same pages the other
// roles reach from the rail.
const PAGES = {
  account: () => <AccountPage />,
  projects: () => <TaskChannel title={{ key: 'all', name: 'Projects' }} />,
  residents: () => <ResidentChannel title={{ key: 'me', name: 'Residents' }} />,
  chataccounts: () => <ChatAccountChannel title={{ key: 'me', name: 'Chat accounts' }} />,
};

export default function SettingsChannel({ title }) {
  const Page = PAGES[title.key] ?? PAGES.account;
  return <Page />;
}
