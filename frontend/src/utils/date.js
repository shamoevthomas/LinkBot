// Backend stores naive UTC (datetime.utcnow().isoformat()), so ISO strings
// arrive without a timezone designator. Browsers then parse them as LOCAL,
// which shifts every displayed time by the user's UTC offset. Appending 'Z'
// forces UTC parsing so toLocale* methods render in the user's real timezone.
export function parseServerDate(iso) {
  if (!iso) return null;
  const s = typeof iso === 'string' ? iso : String(iso);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + 'Z');
}

export function formatServerTime(iso, opts = { hour: '2-digit', minute: '2-digit' }) {
  const d = parseServerDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', opts);
}

export function formatServerDate(iso, opts) {
  const d = parseServerDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', opts);
}

export function formatServerDateTime(iso, opts) {
  const d = parseServerDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', opts);
}
