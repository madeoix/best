async function requestJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);

  if (!data) {
    return {
      ok: false,
      error: `Invalid JSON from ${url}`
    };
  }

  return data;
}

export function getSessions() {
  return requestJson('/api/beacon/sessions');
}

export function sessionAction(action, payload = {}) {
  return requestJson('/api/beacon/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
}

export function getObservatoryStatus() {
  return requestJson('/api/beacon/observatory/status');
}

export function searchObservatory(query = '', limit = 60) {
  const qs = new URLSearchParams({
    q: query,
    limit: String(limit)
  });

  return requestJson(`/api/beacon/observatory/search?${qs}`);
}

export function getObservatoryItem(sourceXml) {
  const qs = new URLSearchParams({
    source_xml: sourceXml
  });

  return requestJson(`/api/beacon/observatory/item?${qs}`);
}

export function getSpinPrices() {
  return requestJson('/api/beacon/spin/prices');
}

export function runBeaconAction(action) {
  return requestJson('/api/beacon/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
}



// Item profiles carry live identity enrichment. Do not client-cache them while
// owner/avatar identity is changing, and do not let batch prefetch poison the
// profile shown in Search/Profile sidebars.
const itemProfilePending = new Map();

export async function getItemProfile(sourceXml) {
  const key = String(sourceXml || '').trim();

  if (!key) {
    return { ok: false, error: 'Missing source_xml' };
  }

  const pending = itemProfilePending.get(key);

  if (pending) {
    return pending;
  }

  const params = new URLSearchParams({
    source_xml: key,
    _: String(Date.now())
  });

  const request = requestJson(`/api/beacon/item/profile?${params.toString()}`)
    .then((payload) => {
      itemProfilePending.delete(key);
      return payload;
    })
    .catch((err) => {
      itemProfilePending.delete(key);
      throw err;
    });

  itemProfilePending.set(key, request);
  return request;
}

export function prefetchItemProfiles(items = [], limit = 8) {
  getItemProfilesBatch(items, limit).catch(() => {});
}

export async function getItemProfilesBatch(items = [], limit = 8) {
  const sourceXmls = [];

  for (const item of items) {
    const sourceXml = item?.source_xml;

    if (!sourceXml) continue;
    if (sourceXmls.includes(sourceXml)) continue;

    sourceXmls.push(sourceXml);

    if (sourceXmls.length >= limit) break;
  }

  if (!sourceXmls.length) {
    return { ok: true, profiles: {} };
  }

  const params = new URLSearchParams();

  for (const sourceXml of sourceXmls) {
    params.append('source_xml', sourceXml);
  }

  // Fetch is kept for future warmup, but result is not written into the
  // single-profile cache. The single-profile route performs source_xml
  // normalization and owner identity enrichment.
  return requestJson(`/api/beacon/item/profiles?${params.toString()}&_=${Date.now()}`);
}

export async function getBeaconWorld() {
  const res = await fetch('/api/beacon/world');

  if (!res.ok) {
    throw new Error(`Beacon world failed (${res.status})`);
  }

  return res.json();
}

export async function getSpaceProfile(spaceId) {
  const id = String(spaceId || '').trim();

  if (!id) {
    throw new Error('Missing space id');
  }

  const res = await fetch(`/api/beacon/space/profile?space_id=${encodeURIComponent(id)}`);

  if (!res.ok) {
    throw new Error(`Space profile failed (${res.status})`);
  }

  return res.json();
}
