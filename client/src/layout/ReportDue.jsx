import { Link, useLocation } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { WRITE_REPORT_PATH } from '../constants.js';
import { useReportStatus } from '../channels/report/ReportStatus.jsx';

// "Report due" in the corner of every screen until today's daily report is
// sent. It opens the Dashboard with the report modal.
export default function ReportDue() {
  const location = useLocation();
  const { data } = useReportStatus();
  if (!data?.canWrite || !data.due) return null;
  if (location.search.includes('write=1')) return null;
  return (
    <Link className="report-due" to={WRITE_REPORT_PATH}>
      <Icon name="file" size={14} /> {data.draft ? 'Finish report' : 'Report due'}
    </Link>
  );
}
