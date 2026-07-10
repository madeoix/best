export function fmtDate(value) {
  if (!value) return 'unknown';

  const d = new Date(String(value).replace(' ', 'T'));

  if (Number.isNaN(d.getTime())) {
    return String(value);
  }

  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function fmtNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat().format(n);
}

export function shortXml(value = '') {
  const parts = value.split('/').filter(Boolean);
  return parts.slice(-3).join('/');
}

export function itemName(item) {
  return item?.name || item?.display_name || item?.title || 'Unknown item';
}

export function itemDescription(item) {
  return item?.description || 'No description in source data.';
}
