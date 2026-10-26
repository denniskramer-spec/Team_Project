import { Link, useLocation } from 'react-router-dom';
import { useLiveData } from '../useLiveData.js';
import Icon from '../components/Icon.jsx';

// "Report due" in the corner of every screen until today's daily report is
// sent. It opens the Dashboard with the report modal.
export default function ReportDue() {
  const location = useLocation();
  const { data } = useLiveData('/reports/status', ['report:changed']);
  if (!data?.canWrite || !data.due) return null;
  if (location.search.includes('write=1')) return null;
  return (
    <Link className="report-due" to="/report?write=1">
      <Icon name="file" size={14} /> {data.draft ? 'Finish report' : 'Report due'}
    </Link>
  );
}
