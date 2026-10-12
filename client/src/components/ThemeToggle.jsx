import Icon from './Icon.jsx';
import { useTheme } from '../theme.js';

// One button that flips between the dark and light theme.
export default function ThemeToggle({ className = '' }) {
  const [theme, toggle] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${className}`}
      onClick={toggle}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
