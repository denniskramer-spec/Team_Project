// The unread count on the browser tab's icon, like a messenger: the app's
// "BM" square with a red badge in its corner. 0 puts the plain icon back.
// The icon is an SVG data URL (the page's CSP allows data: images).

const PLAIN = '/favicon.svg';

function badgeIcon(count) {
  const text = count > 99 ? '99+' : String(count);
  // A big pill in the bottom-right corner (a tab icon is drawn at 16px),
  // wider for two or three characters.
  const w = text.length === 1 ? 24 : text.length === 2 ? 30 : 32;
  const size = text.length === 3 ? 15 : 21;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
    + '<rect width="32" height="32" rx="8" fill="#5865f2"/>'
    + '<text x="16" y="21" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="13" font-weight="800" fill="#fff">BM</text>'
    + `<rect x="${32 - w}" y="8" width="${w}" height="24" rx="12" fill="#ed4245"/>`
    + `<text x="${32 - w / 2}" y="${20 + size * 0.36}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="700" fill="#fff">${text}</text>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let shown = 0;
export function setTabBadge(count) {
  const n = Math.max(0, count | 0);
  if (n === shown) return;
  shown = n;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = n > 0 ? badgeIcon(n) : PLAIN;
}
