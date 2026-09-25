import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Section 2: the titles of the selected channel.
//
// Titles come in named sections (drawn with a heading and a dividing line) and
// may have children, which makes the tree three deep:
//   title  ->  group (?g=)  ->  member (?m=)
// A title with `queryKey` keeps the current title and sets a query value instead.
export default function TitleList({ channel, current }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isChat = channel.key === 'chat';
  const selectedMember = searchParams.get('m') ?? '';
  const selectedGroup = searchParams.get('g') ?? '';

  const sections = [];
  channel.titles.forEach((t) => {
    const name = t.section ?? '';
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.titles.push(t);
    else sections.push({ name, titles: [t] });
  });

  // The same member is listed under "All" and under their own group, so a member
  // row is only highlighted when its branch is the selected one too.
  const inSelectedBranch = (parent) => {
    if (!parent) return true;
    if (parent.queryKey === 'g') return selectedGroup === parent.queryValue;
    return parent.key === current; // a title-based group (the Member channel)
  };

  const isActive = (t, parent) => {
    if (t.queryKey === 'm') return selectedMember === t.queryValue && inSelectedBranch(parent);
    if (t.queryKey === 'g') return selectedGroup === t.queryValue && !selectedMember;
    return t.key === current && !selectedMember;
  };
  // Branches stay collapsed until you open one, or something inside is chosen.
  // "All" is never auto-opened, or every member would be listed twice.
  const holdsSelection = (t) => Boolean(
    t.children?.length && (
      (selectedMember && t.children.some((c) => c.queryValue === selectedMember) && inSelectedBranch(t))
      || (t.queryKey === 'g' && t.queryValue && selectedGroup === t.queryValue)
      || (!t.queryKey && t.key !== 'all' && t.key === current)
    ),
  );

  const [open, setOpen] = useState(() => new Set());
  // Keep the branch holding the current selection open.
  useEffect(() => {
    const auto = channel.titles.filter(holdsSelection).map((t) => t.key);
    if (auto.length) setOpen((prev) => new Set([...prev, ...auto]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.key, current, selectedGroup, selectedMember]);

  const linkFor = (t, parent) => {
    const params = new URLSearchParams(searchParams);
    let titleKey = current;

    if (!t.queryKey) {
      // A plain title: switching it keeps the group and member, but not the period.
      titleKey = t.key;
      params.delete('p');
      if (parent) params.delete('m');
    } else if (parent && !parent.queryKey) {
      // A member under a title-based group (the Member channel).
      titleKey = parent.key;
    }

    if (t.queryKey) {
      if (t.queryValue) params.set(t.queryKey, t.queryValue);
      else params.delete(t.queryKey);
      // Choosing a group clears any member inside it.
      if (t.queryKey === 'g') params.delete('m');
      // Choosing a member also records the branch it was picked from, so the
      // same person under "All" and under their group stay distinct.
      if (t.queryKey === 'm' && parent?.queryKey === 'g') {
        if (parent.queryValue) params.set('g', parent.queryValue);
        else params.delete('g');
      }
    } else if (!parent) {
      params.delete('m');
    }

    const query = params.toString();
    return `/${channel.key}/${titleKey}${query ? `?${query}` : ''}`;
  };

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderItem = (t, parent) => {
    const active = isActive(t, parent);
    const expandable = Boolean(t.children?.length);
    const expanded = expandable && open.has(t.key);

    return (
      <li key={t.key} className={parent ? 'title-child' : ''}>
        <div className={`title-row ${active ? 'active' : ''}`}>
          {expandable ? (
            <button
              className="title-twisty"
              onClick={() => toggle(t.key)}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${t.name}`}
            >
              <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
          ) : <span className="title-twisty placeholder" />}
          <Link
            to={linkFor(t, parent)}
            className="title-item"
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              name={parent ? 'user' : isChat ? 'hash' : t.groupId || expandable ? 'users' : 'dot'}
              size={parent ? 14 : 16}
              className="title-icon"
            />
            <span className="title-name">{t.name}</span>
            {t.badge > 0 && <span className="badge">{t.badge}</span>}
          </Link>
        </div>
        {expanded && (
          <ul className="titles-list child-list">
            {t.children.map((child) => renderItem(child, t))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="titles">
      <div className="titles-head">{channel.name}</div>
      <div className="titles-scroll">
        {sections.map((section, i) => (
          <section key={section.name || `section-${i}`} className={`title-section ${i > 0 ? 'divided' : ''}`}>
            {section.name && <h4 className="title-section-head">{section.name}</h4>}
            <ul className="titles-list">{section.titles.map((t) => renderItem(t, null))}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
