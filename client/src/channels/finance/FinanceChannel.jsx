import IncomePage from './IncomePage.jsx';
import OutcomePage from './OutcomePage.jsx';
import TotalPage from './TotalPage.jsx';

// Section 3 for the Finance channel. The title picks the page; the group
// and member come from the title list (?g=, ?m=) and the period from the
// page toolbar (see useFinancePeriod.js).
const PAGES = { income: IncomePage, outcome: OutcomePage, total: TotalPage };

export default function FinanceChannel({ title }) {
  const Page = PAGES[title.key] ?? IncomePage;
  return <Page />;
}
