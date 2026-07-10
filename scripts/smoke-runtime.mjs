import process from 'node:process';

const publicBase = (
  process.env.SMALLVERSE_PUBLIC_API_BASE ||
  'http://127.0.0.1:8780'
).replace(/\/+$/, '');
const operatorBase = (
  process.env.SMALLVERSE_OPERATOR_API_BASE ||
  'http://127.0.0.1:8781'
).replace(/\/+$/, '');
const operatorToken =
  process.env.SMALLVERSE_OPERATOR_TOKEN ||
  'smallverse-local-operator-token-change-me';

async function request(
  base,
  pathname,
  {
    expected = 200,
    headers = {},
    parse = 'json'
  } = {}
) {
  const response = await fetch(`${base}${pathname}`, { headers });
  const body = parse === 'text'
    ? await response.text()
    : await response.json().catch(() => null);

  if (response.status !== expected) {
    throw new Error(
      `${pathname}: expected HTTP ${expected}, received ` +
      `${response.status}\n${JSON.stringify(body, null, 2)}`
    );
  }

  console.log(`PASS ${response.status} ${pathname}`);
  return body;
}

const health = await request(publicBase, '/api/v1/health');
if (!health?.data?.dependencies) {
  throw new Error('Public health response omitted dependency status.');
}

const world = await request(publicBase, '/api/beacon/world');
const search = await request(
  publicBase,
  '/api/beacon/observatory/search?q=&limit=5'
);

const firstItem = search?.items?.find((item) => item?.source_xml);
if (!firstItem) {
  throw new Error(
    'The preserved Observatory export returned no searchable items.'
  );
}

const source = encodeURIComponent(firstItem.source_xml);

await request(
  publicBase,
  `/api/beacon/observatory/item?source_xml=${source}`
);
await request(
  publicBase,
  `/api/beacon/item/profile?source_xml=${source}`
);
await request(
  publicBase,
  `/api/v1/items/profile?source_xml=${source}`
);

await request(
  publicBase,
  '/api/beacon/avatar/badge?label=SV&status=verified',
  { parse: 'text' }
);

const firstAvatar = world?.avatars?.find((avatar) => avatar?.avatar_id);
if (firstAvatar) {
  const id = encodeURIComponent(firstAvatar.avatar_id);
  await request(
    publicBase,
    `/api/beacon/avatar/profile?avatar_id=${id}`
  );
  await request(publicBase, `/api/v1/avatars/${id}`);
} else {
  console.log('SKIP avatar profile: world export has no avatar records');
}

const firstSpace = world?.spaces?.find((space) => space?.space_id);
if (firstSpace) {
  const id = encodeURIComponent(firstSpace.space_id);
  await request(
    publicBase,
    `/api/beacon/space/profile?space_id=${id}`
  );
  await request(publicBase, `/api/v1/spaces/${id}`);
} else {
  console.log('SKIP space profile: world export has no space records');
}

await request(publicBase, '/api/beacon/spin/prices');
await request(publicBase, '/api/v1/spin/prices');

await request(publicBase, '/ops/v1/health', { expected: 404 });
await request(operatorBase, '/_service', { expected: 401 });
await request(operatorBase, '/_service', {
  headers: {
    authorization: `Bearer ${operatorToken}`
  }
});

console.log('\nSmallverse local runtime smoke test passed.');
