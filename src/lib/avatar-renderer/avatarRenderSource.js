const RENDER_DOCUMENTS = [
  ['contractV4', 'render-contract.v4.json'],
  ['bundleV3', 'render-bundle.v3.json'],
  ['bodyManifest', 'body-render-manifest.json']
];

function text(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function safeRenderUrl(value) {
  const url = text(value);
  if (!url) return null;

  if (/^(?:https?:)?\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('/tmp/')) return url;

  return null;
}

function documentMatchesAvatar(document, avatarId) {
  const documentAvatarId = text(document?.avatar_id);
  return !documentAvatarId || documentAvatarId === avatarId;
}

function candidate(kind, value, source, priority) {
  const url = safeRenderUrl(value);
  if (!url) return null;

  return {
    kind,
    url,
    source,
    priority,
    captured: source.startsWith('captured-')
  };
}

function addCandidate(target, value) {
  if (!value) return;
  if (target.some((entry) => entry.url === value.url)) return;
  target.push(value);
}

function calibrationCandidates(document, avatarId) {
  if (
    document?.contract !== 'beacon-avatar-calibration/v1' ||
    document?.sanitized === false ||
    !documentMatchesAvatar(document, avatarId)
  ) {
    return [];
  }

  const state = document?.states?.[0] ?? {};
  const output = [];

  addCandidate(output, candidate(
    'full-body',
    state.body,
    'captured-flash-calibration-v1',
    5
  ));
  addCandidate(output, candidate(
    'preview',
    state.preview,
    'captured-flash-calibration-v1',
    6
  ));
  addCandidate(output, candidate(
    'thumb',
    state.thumb,
    'captured-flash-calibration-v1',
    7
  ));

  return output;
}

function contractV4Candidates(document, avatarId) {
  if (
    document?.contract !== 'smallverse-avatar-render-contract/v4' ||
    !documentMatchesAvatar(document, avatarId)
  ) {
    return [];
  }

  const oracle = document.oracle ?? {};
  const output = [];

  addCandidate(output, candidate(
    'full-body',
    oracle.full_body,
    'captured-flash-contract-v4',
    10
  ));
  addCandidate(output, candidate(
    'preview',
    oracle.preview,
    'captured-flash-contract-v4',
    11
  ));
  addCandidate(output, candidate(
    'thumb',
    oracle.thumb,
    'captured-flash-contract-v4',
    12
  ));

  return output;
}

function bundleV3Candidates(document, avatarId) {
  if (
    document?.contract !== 'smallverse-avatar-render-bundle/v3' ||
    !documentMatchesAvatar(document, avatarId)
  ) {
    return [];
  }

  const oracle = document.oracle ?? {};
  const output = [];

  addCandidate(output, candidate(
    'full-body',
    oracle.flash_full_body_url,
    'captured-flash-bundle-v3',
    20
  ));
  addCandidate(output, candidate(
    'preview',
    oracle.flash_preview_url,
    'captured-flash-bundle-v3',
    21
  ));
  addCandidate(output, candidate(
    'thumb',
    oracle.flash_thumb_url,
    'captured-flash-bundle-v3',
    22
  ));

  return output;
}

function bodyManifestCandidates(document, avatarId) {
  if (
    document?.contract !== 'smallverse-avatar-body-render-manifest/v1' ||
    !documentMatchesAvatar(document, avatarId)
  ) {
    return [];
  }

  const output = [];

  addCandidate(output, candidate(
    'full-body',
    document.fallback_full_body,
    'captured-flash-body-manifest-v1',
    30
  ));
  addCandidate(output, candidate(
    'preview',
    document.fallback_preview,
    'captured-flash-body-manifest-v1',
    31
  ));
  addCandidate(output, candidate(
    'thumb',
    document.fallback_thumb,
    'captured-flash-body-manifest-v1',
    32
  ));

  return output;
}

function profileCandidates(profile) {
  const avatar = profile?.avatar ?? profile ?? {};
  const packet = profile?.render_packet ?? {};
  const output = [];

  addCandidate(output, candidate(
    'full-body',
    packet.full_body_url ?? avatar.render_url ?? avatar.full_body_url,
    'preserved-profile-assets',
    50
  ));
  addCandidate(output, candidate(
    'preview',
    packet.preview_url ?? avatar.snapshot_url,
    'preserved-profile-assets',
    60
  ));
  addCandidate(output, candidate(
    'thumb',
    packet.thumb_url ?? avatar.thumb_url,
    'preserved-profile-assets',
    70
  ));
  addCandidate(output, candidate(
    'head',
    packet.head_url ?? avatar.head_url,
    'preserved-profile-assets',
    80
  ));

  return output;
}

function firstCandidate(candidates, kind) {
  return candidates.find((entry) => entry.kind === kind) ?? null;
}

export function buildAvatarRenderSource({
  avatarId,
  profile = null,
  documents = {}
}) {
  const normalizedAvatarId = text(avatarId);

  if (!normalizedAvatarId) {
    return {
      avatarId: '',
      status: 'missing',
      label: 'Avatar ID is missing',
      candidates: [],
      primary: null,
      fullBodyUrl: null,
      previewUrl: null,
      thumbUrl: null,
      headUrl: null,
      capabilities: {
        captured: false,
        reconstruction: false,
        comparison: false
      },
      evidenceUrls: []
    };
  }

  const candidates = [];

  for (const entry of calibrationCandidates(documents.calibration, normalizedAvatarId)) {
    addCandidate(candidates, entry);
  }
  for (const entry of contractV4Candidates(documents.contractV4, normalizedAvatarId)) {
    addCandidate(candidates, entry);
  }
  for (const entry of bundleV3Candidates(documents.bundleV3, normalizedAvatarId)) {
    addCandidate(candidates, entry);
  }
  for (const entry of bodyManifestCandidates(documents.bodyManifest, normalizedAvatarId)) {
    addCandidate(candidates, entry);
  }
  for (const entry of profileCandidates(profile)) {
    addCandidate(candidates, entry);
  }

  candidates.sort((left, right) => left.priority - right.priority);

  const fullBody = firstCandidate(candidates, 'full-body');
  const preview = firstCandidate(candidates, 'preview');
  const thumb = firstCandidate(candidates, 'thumb');
  const head = firstCandidate(candidates, 'head');
  const primary = fullBody ?? preview ?? thumb ?? head;
  const captured = candidates.some((entry) => entry.captured);
  const reconstruction =
    documents.contractV4?.contract ===
      'smallverse-avatar-render-contract/v4' &&
    documentMatchesAvatar(documents.contractV4, normalizedAvatarId);

  const evidenceUrls = [];
  const base = `/avatar-renders/${encodeURIComponent(normalizedAvatarId)}`;

  if (
    documents.calibration?.contract ===
      'beacon-avatar-calibration/v1' &&
    documentMatchesAvatar(documents.calibration, normalizedAvatarId)
  ) {
    evidenceUrls.push({
      label: 'calibration manifest',
      url: `/avatar-calibration/${encodeURIComponent(normalizedAvatarId)}/manifest.json`
    });
  }
  if (reconstruction) {
    evidenceUrls.push({
      label: 'render-contract.v4.json',
      url: `${base}/render-contract.v4.json`
    });
  }
  if (
    documents.bundleV3?.contract ===
      'smallverse-avatar-render-bundle/v3' &&
    documentMatchesAvatar(documents.bundleV3, normalizedAvatarId)
  ) {
    evidenceUrls.push({
      label: 'render-bundle.v3.json',
      url: `${base}/render-bundle.v3.json`
    });
  }
  if (
    documents.bodyManifest?.contract ===
      'smallverse-avatar-body-render-manifest/v1' &&
    documentMatchesAvatar(documents.bodyManifest, normalizedAvatarId)
  ) {
    evidenceUrls.push({
      label: 'body-render-manifest.json',
      url: `${base}/body-render-manifest.json`
    });
  }

  let label = 'No verified avatar render is available';

  if (primary?.source === 'captured-flash-calibration-v1') {
    label = reconstruction
      ? 'Captured Flash calibration with reconstruction contract'
      : 'Captured Flash calibration render';
  } else if (primary?.source === 'captured-flash-contract-v4') {
    label = 'Captured Flash render with reconstruction contract';
  } else if (primary?.captured) {
    label = 'Captured Flash render';
  } else if (primary) {
    label = 'Preserved profile image';
  }

  return {
    avatarId: normalizedAvatarId,
    status: primary ? 'ready' : 'missing',
    label,
    candidates,
    primary,
    fullBodyUrl: fullBody?.url ?? null,
    previewUrl: preview?.url ?? null,
    thumbUrl: thumb?.url ?? null,
    headUrl: head?.url ?? null,
    capabilities: {
      captured,
      reconstruction,
      comparison: captured
    },
    evidenceUrls
  };
}

async function fetchJsonMaybe(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: {
        accept: 'application/json'
      }
    });

    if (!response.ok) return null;

    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType && !contentType.includes('json')) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function resolveAvatarRenderSource({
  avatarId,
  profile = null,
  fetchImpl = globalThis.fetch
}) {
  const normalizedAvatarId = text(avatarId);

  if (!normalizedAvatarId || typeof fetchImpl !== 'function') {
    return buildAvatarRenderSource({
      avatarId: normalizedAvatarId,
      profile
    });
  }

  const encodedAvatarId = encodeURIComponent(normalizedAvatarId);
  const base = `/avatar-renders/${encodedAvatarId}`;
  const entries = await Promise.all([
    ...RENDER_DOCUMENTS.map(async ([key, filename]) => [
      key,
      await fetchJsonMaybe(fetchImpl, `${base}/${filename}`)
    ]),
    (async () => [
      'calibration',
      await fetchJsonMaybe(
        fetchImpl,
        `/avatar-calibration/${encodedAvatarId}/manifest.json`
      )
    ])()
  ]);

  return buildAvatarRenderSource({
    avatarId: normalizedAvatarId,
    profile,
    documents: Object.fromEntries(entries)
  });
}
