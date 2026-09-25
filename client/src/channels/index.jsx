import Placeholder from './Placeholder.jsx';
import MemberChannel from './member/MemberChannel.jsx';
import AdminChannel from './admin/AdminChannel.jsx';
import InstructionChannel from './instruction/InstructionChannel.jsx';
import ChatChannel from './chat/ChatChannel.jsx';
import ReportChannel from './report/ReportChannel.jsx';
import PlanChannel from './plan/PlanChannel.jsx';
import TaskChannel from './task/TaskChannel.jsx';
import FinanceChannel from './finance/FinanceChannel.jsx';
import CheckoutChannel from './checkout/CheckoutChannel.jsx';
import AssetChannel from './asset/AssetChannel.jsx';

// Maps a channel key to the component that renders section 3.
// Each later step registers its channel here.
const REGISTRY = {
  instruction: InstructionChannel,
  member: MemberChannel,
  report: ReportChannel,
  plan: PlanChannel,
  task: TaskChannel,
  finance: FinanceChannel,
  checkout: CheckoutChannel,
  asset: AssetChannel,
  chat: ChatChannel,
  admin: AdminChannel,
};

export default function ChannelContent({ channel, title }) {
  const Component = REGISTRY[channel.key] || Placeholder;
  // key resets the page's state when switching titles.
  return <Component key={`${channel.key}/${title.key}`} channel={channel} title={title} />;
}
