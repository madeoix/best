import {
  operatorRequestJson,
  publicRequestJson
} from '$lib/runtime/apiClient.js';

export function getSessions() {
  return operatorRequestJson('/api/beacon/sessions');
}

export function sessionAction(action, payload = {}) {
  return operatorRequestJson('/api/beacon/sessions', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload })
  });
}

export function getObservatoryStatus() {
  return publicRequestJson('/api/beacon/observatory/status');
}

export function searchObservatory(query = '', limit = 60) {
  const qs = new URLSearchParams({
    q: query,
    limit: String(limit)
  });

  return publicRequestJson(`/api/beacon/observatory/search?${qs}`);
}

export function getObservatoryItem(sourceXml) {
  const qs = new URLSearchParams({
    source_xml: sourceXml
  });

  return publicRequestJson(`/api/beacon/observatory/item?${qs}`);
}

export function getSpinPrices() {
  return publicRequestJson('/api/beacon/spin/prices');
}

export function runBeaconAction(action) {
  return operatorRequestJson('/api/beacon/action', {
    method: 'POST',
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

  const request = publicRequestJson(
    `/api/beacon/item/profile?${params.toString()}`
  )
    .then((payload) => {
      itemProfilePending.delete(key);
      return payload;
    })
    .catch((error) => {
      itemProfilePending.delete(key);
      throw error;
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

    if (!sourceXml || sourceXmls.includes(sourceXml)) continue;

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

  return publicRequestJson(
    `/api/beacon/item/profiles?${params.toString()}&_=${Date.now()}`
  );
}

export function getBeaconWorld() {
  return publicRequestJson('/api/beacon/world');
}

export async function getSpaceProfile(spaceId) {
  const id = String(spaceId || '').trim();

  if (!id) {
    throw new Error('Missing space id');
  }

  return publicRequestJson(
    `/api/beacon/space/profile?space_id=${encodeURIComponent(id)}`
  );
}
