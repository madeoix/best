function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalize(value) {
  return clean(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function selectedOptions(value) {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  if (!Array.isArray(rows)) rows = rows && typeof rows === 'object' ? [rows] : [];

  return [...new Set(rows
    .map((row) => clean(row?.selected ?? row?.value ?? row?.label ?? row?.name))
    .filter(Boolean))];
}

export function variantDisplayName(variant, baseName = '') {
  const base = normalize(baseName);
  const label = clean(variant?.variant_label);
  if (label && normalize(label) !== base) return label.replace(/([a-z])([A-Z])/g, '$1 $2');

  const options = selectedOptions(variant?.variant_options_json ?? variant?.variant_options);
  if (options.length) return options.join(' · ').replace(/([a-z])([A-Z])/g, '$1 $2');

  const instance = clean(variant?.instance_name);
  if (instance && normalize(instance) !== base) return instance;

  return 'Variant not decoded';
}

export function shortUid(value) {
  const uid = clean(value);
  return uid.length > 16 ? `${uid.slice(0, 8)}…${uid.slice(-6)}` : uid;
}
