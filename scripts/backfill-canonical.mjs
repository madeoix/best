import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.join(root, '.local-data', 'workspace');
const cacheRoot = path.join(root, 'static', 'canonical-assets');
const reportPath = path.join(workspace, 'canonical-backfill-report.json');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(workspace, name), 'utf8'));
const readJsonMaybe = async (name, fallback) => {
  try { return await readJson(name); } catch { return fallback; }
};
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const safeTime = (value, fallback) => Number.isFinite(Date.parse(value || '')) ? value : fallback;
const report = { startedAt: new Date().toISOString(), accepted: {}, rejected: {}, warnings: [] };

function publication(entityKind, eligible, reasons) {
  return { entityKind, eligible, reasons };
}

function avatarPublication(name, status, assetId) {
  const reasons = [];
  if (!name || status === 'unresolved') reasons.push('AVATAR_NAME_UNRESOLVED');
  if (!assetId) reasons.push('AVATAR_PORTRAIT_MISSING');
  return publication('avatar', reasons.length === 0, reasons);
}

function spacePublication(id, name, assetId) {
  const reasons = [];
  if (!name || name.toLowerCase() === id.toLowerCase() || /^[0-9a-f]{24,64}$/i.test(name)) reasons.push('SPACE_NAME_UNRESOLVED');
  if (!assetId) reasons.push('SPACE_SNAPSHOT_MISSING');
  return publication('space', reasons.length === 0, reasons);
}

function itemPublication(rarity, assetId) {
  const reasons = [];
  if (!['rare', 'legendary'].includes(rarity)) reasons.push('ITEM_NOT_XML_RARE_OR_LEGENDARY');
  if (!assetId) reasons.push('ITEM_ICON_MISSING');
  return publication('item', reasons.length === 0, reasons);
}

async function cacheRemote(url, kind, key) {
  if (!url || !/^https:\/\/content\.smallverse\.app\//.test(url)) return null;
  const extension = path.extname(new URL(url).pathname) || '.bin';
  const relative = path.posix.join('canonical-assets', kind, `${key}${extension}`);
  const target = path.join(root, 'static', relative);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('empty response');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return { bytes, storageKey: `/${relative}`, mediaType: response.headers.get('content-type') || 'image/png' };
  } catch (error) {
    report.warnings.push({ kind, key, url, error: error.message });
    return null;
  }
}

async function localAvatarMedia(avatarId) {
  for (const filename of ['thumb.png', 'head.png']) {
    const file = path.join(root, 'static', 'avatar-thumbnails', avatarId, filename);
    try {
      return { bytes: await fs.readFile(file), storageKey: `/avatar-thumbnails/${avatarId}/${filename}`, mediaType: 'image/png' };
    } catch {}
  }
  return null;
}

async function insertAsset(client, media, kind, metadata) {
  if (!media) return null;
  const digest = sha256(media.bytes);
  await client.query(`INSERT INTO blobs (sha256, storage_key, byte_size, media_type, verified_at)
    VALUES ($1,$2,$3,$4,now()) ON CONFLICT (sha256) DO NOTHING`,
    [digest, media.storageKey, media.bytes.length, media.mediaType]);
  const existing = await client.query(`SELECT id FROM assets
    WHERE blob_sha256=$1 AND asset_kind=$2 AND visibility='public'
    ORDER BY created_at ASC LIMIT 1`, [digest, kind]);
  if (existing.rowCount) return existing.rows[0].id;
  const result = await client.query(`INSERT INTO assets (blob_sha256, asset_kind, visibility, metadata)
    VALUES ($1,$2,'public',$3) RETURNING id`, [digest, kind, metadata]);
  return result.rows[0].id;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await fs.mkdir(cacheRoot, { recursive: true });
  const now = new Date().toISOString();
  const [identity, world, profiles, renderQueue, observatory, liveEvidence] = await Promise.all([
    readJson('owner-avatar-identity-graph.json'),
    readJson('beacon-world-index.json'),
    readJson('beacon-item-profiles.json'),
    readJson('beacon-avatar-render-queue.json'),
    readJson('observatory-sync.json'),
    readJsonMaybe('canonical-live-evidence.json', { equipped: [], avatarLocations: [] })
  ]);
  await client.query('BEGIN');
  const manifestSha = sha256(Buffer.from(JSON.stringify({ identity, world, profiles, renderQueue, observatory, liveEvidence })));
  const generationKey = `preserved-import:${manifestSha.slice(0, 24)}`;
  // A capture generation is written before any snapshot references it.  This
  // is immutable provenance, not a mutable "last sync" marker.
  await client.query(`INSERT INTO capture_generations
    (generation_key,crawler_id,outcome,started_at,completed_at,evidence_manifest_sha256,counts)
    VALUES ($1,'preserved-import','succeeded',$2,$2,$3,'{}') ON CONFLICT (generation_key) DO NOTHING`,
    [generationKey, report.startedAt, manifestSha]);

  let avatars = 0, avatarRejected = 0;
  for (const row of identity.avatars || []) {
    const id = String(row.avatar_id || '').trim();
    const name = String(row.name || '').trim();
    const media = id ? await localAvatarMedia(id) : null;
    if (!id || !name || !media) { avatarRejected++; continue; }
    const assetId = await insertAsset(client, media, 'avatar-thumbnail', { avatarId: id, source: 'preserved-find-friends' });
    const first = safeTime(row.first_observed_at, now);
    const last = safeTime(row.last_observed_at, first);
    await client.query(`INSERT INTO avatars (avatar_id, owner_id, name, name_status, thumbnail_asset_id, first_observed_at, last_observed_at)
      VALUES ($1,NULL,$2,$3,$4,$5,$6) ON CONFLICT (avatar_id) DO UPDATE SET
      name=excluded.name, name_status=excluded.name_status, thumbnail_asset_id=excluded.thumbnail_asset_id,
      last_observed_at=greatest(avatars.last_observed_at, excluded.last_observed_at)`,
      [id, name, row.name_status === 'verified' ? 'verified' : 'observed', assetId, first, last]);
    const decision = avatarPublication(name, row.name_status, assetId);
    await client.query(`INSERT INTO publication_decisions (entity_kind,canonical_key,eligible,reasons)
      VALUES ($1,$2,$3,$4) ON CONFLICT (entity_kind,canonical_key) DO UPDATE SET eligible=excluded.eligible,reasons=excluded.reasons,evaluated_at=now()`,
      [decision.entityKind, id, decision.eligible, decision.reasons]);
    await client.query(`INSERT INTO enrichment_jobs (kind,canonical_key,reason,status)
      VALUES ('avatar-config',$1,'No authoritative config snapshot imported.','queued') ON CONFLICT DO NOTHING`, [id]);
    avatars++;
  }

  let spaces = 0, spaceRejected = 0;
  for (const row of world.spaces || []) {
    const id = String(row.space_id || '').trim();
    const name = String(row.display_name || row.space_name || '').trim();
    if (!id || !name) { spaceRejected++; continue; }
    const url = row.snapshot_url || row.thumb_url;
    const media = await cacheRemote(url, 'spaces', id);
    if (!media) { spaceRejected++; continue; }
    const assetId = await insertAsset(client, media, 'space-snapshot', { spaceId: id, sourceUrl: url });
    const seen = safeTime(row.latest_seen, now);
    await client.query(`INSERT INTO spaces (space_id,owner_id,display_name,snapshot_asset_id,first_observed_at,last_observed_at)
      VALUES ($1,NULL,$2,$3,$4,$4) ON CONFLICT (space_id) DO UPDATE SET display_name=excluded.display_name,
      snapshot_asset_id=excluded.snapshot_asset_id,last_observed_at=greatest(spaces.last_observed_at,excluded.last_observed_at)`, [id, name, assetId, seen]);
    const decision = spacePublication(id, name, assetId);
    await client.query(`INSERT INTO publication_decisions (entity_kind,canonical_key,eligible,reasons)
      VALUES ($1,$2,$3,$4) ON CONFLICT (entity_kind,canonical_key) DO UPDATE SET eligible=excluded.eligible,reasons=excluded.reasons,evaluated_at=now()`,
      [decision.entityKind, id, decision.eligible, decision.reasons]);
    spaces++;
  }

  let configSnapshots = 0;
  for (const row of renderQueue.avatars || []) {
    const avatarId = String(row.avatar_id || '').trim();
    const configSha = String(row.config_sha256 || '').trim();
    const configXml = String(row.config_xml || '');
    if (!avatarId || !/^[a-f0-9]{64}$/.test(configSha) || !configXml) continue;
    const exists = await client.query('SELECT 1 FROM avatars WHERE avatar_id=$1', [avatarId]);
    if (!exists.rowCount) continue;
    await client.query(`INSERT INTO avatar_config_snapshots
      (snapshot_id,avatar_id,capture_generation_key,captured_at,config_sha256,source_capture_id,raw_config,equipped_items)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'[]') ON CONFLICT (config_sha256) DO NOTHING`, [
      `rtmp:${configSha}`, avatarId, generationKey, safeTime(row.captured_at, now), configSha,
      row.space_id ? `space:${row.space_id}` : 'preserved-render-queue',
      { configXml, gender: row.gender || null, spaceId: row.space_id || null }
    ]);
    await client.query(`UPDATE enrichment_jobs SET status='completed',updated_at=now()
      WHERE kind='avatar-config' AND canonical_key=$1 AND status='queued'`, [avatarId]);
    await client.query(`INSERT INTO enrichment_jobs (kind,canonical_key,reason,status)
      VALUES ('avatar-render',$1,'Authoritative RTMP config is ready for rendering.','queued') ON CONFLICT DO NOTHING`, [avatarId]);
    configSnapshots++;
  }

  let items = 0, itemRejected = 0, instances = 0, heuristicRelationships = 0;
  for (const profile of Object.values(profiles.profiles || {})) {
    const item = profile?.item || {};
    const sourceXml = String(item.source_xml || '').trim();
    const name = String(item.name || '').trim();
    const rarity = String(item.rarity_label || item.category || '').toLowerCase();
    if (!sourceXml || !name || !['rare', 'legendary'].includes(rarity)) { itemRejected++; continue; }
    const iconUrl = item.icon ? `https://content.smallverse.app/assets/${String(item.icon).replace(/^\/+/, '')}` : null;
    const media = await cacheRemote(iconUrl, 'items', sha256(Buffer.from(sourceXml)).slice(0, 32));
    if (!media) { itemRejected++; continue; }
    const assetId = await insertAsset(client, media, 'item-icon', { sourceXml, sourceUrl: iconUrl });
    const definitionSha = sha256(Buffer.from(JSON.stringify({ sourceXml, name, rarity, icon: item.icon })));
    await client.query(`INSERT INTO item_definitions (source_xml,display_name,category,xml_rarity,icon_asset_id,definition_sha256)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (source_xml) DO UPDATE SET display_name=excluded.display_name,
      category=excluded.category,xml_rarity=excluded.xml_rarity,icon_asset_id=excluded.icon_asset_id,definition_sha256=excluded.definition_sha256`,
      [sourceXml, name, item.category || null, rarity, assetId, definitionSha]);
    const decision = itemPublication(rarity, assetId);
    await client.query(`INSERT INTO publication_decisions (entity_kind,canonical_key,eligible,reasons)
      VALUES ($1,$2,$3,$4) ON CONFLICT (entity_kind,canonical_key) DO UPDATE SET eligible=excluded.eligible,reasons=excluded.reasons,evaluated_at=now()`,
      [decision.entityKind, sourceXml, decision.eligible, decision.reasons]);
    const uids = new Map();
    for (const owner of profile.owners || []) if (owner.latest_uid) uids.set(owner.latest_uid, owner.latest_seen);
    for (const space of profile.spaces || []) if (space.latest_uid) uids.set(space.latest_uid, space.latest_seen);
    for (const [uid, observedAt] of uids) {
      const seen = safeTime(observedAt, now);
      await client.query(`INSERT INTO item_instances (uid,item_definition_source_xml,first_observed_at,last_observed_at)
        VALUES ($1,$2,$3,$3) ON CONFLICT (uid) DO UPDATE SET last_observed_at=greatest(item_instances.last_observed_at,excluded.last_observed_at)`, [uid, sourceXml, seen]);
      instances++;
    }
    heuristicRelationships += (profile.owners || []).filter((row) => row.identity_reason === 'space_panel_owner_avatar_adjacent').length;
    items++;
  }

  let uidVariants = 0, uidVariantRejected = 0;
  for (const variant of observatory.variant_visuals || []) {
    const uid = String(variant.uid || '').trim();
    const sourceXml = String(variant.source_xml || '').trim();
    const iconPath = String(variant.variant_icon || '').trim();
    const options = String(variant.variant_options_json || '').trim();
    const observedAt = safeTime(variant.observed_at, now);
    if (!uid || !sourceXml || !iconPath.startsWith('/variant-icons/') || variant.variant_render_status !== 'rendered') {
      uidVariantRejected++;
      continue;
    }
    const definition = await client.query('SELECT 1 FROM item_definitions WHERE source_xml=$1', [sourceXml]);
    const localPath = path.join(root, 'static', iconPath.replace(/^\/+/, ''));
    let bytes;
    try { bytes = await fs.readFile(localPath); } catch { bytes = null; }
    if (!definition.rowCount || !bytes) { uidVariantRejected++; continue; }
    const media = {
      bytes,
      ext: path.extname(localPath) || '.png',
      mediaType: 'image/png',
      storageKey: iconPath
    };
    const assetId = await insertAsset(client, media, 'uid-variant-icon', {
      uid,
      sourceXml,
      options: options || null
    });
    const configSha = sha256(Buffer.from(options || JSON.stringify({ uid, sourceXml })));
    await client.query(`INSERT INTO item_instances (uid,item_definition_source_xml,first_observed_at,last_observed_at)
      VALUES ($1,$2,$3,$3) ON CONFLICT (uid) DO UPDATE SET
      item_definition_source_xml=excluded.item_definition_source_xml,
      last_observed_at=greatest(item_instances.last_observed_at,excluded.last_observed_at)`, [uid, sourceXml, observedAt]);
    await client.query(`INSERT INTO uid_variant_renders
      (uid,item_definition_source_xml,config_sha256,decoded_label,rendered_asset_id,status,observed_at)
      VALUES ($1,$2,$3,$4,$5,'rendered',$6) ON CONFLICT (uid) DO UPDATE SET
      item_definition_source_xml=excluded.item_definition_source_xml,
      config_sha256=excluded.config_sha256,decoded_label=excluded.decoded_label,
      rendered_asset_id=excluded.rendered_asset_id,status='rendered',observed_at=excluded.observed_at,updated_at=now()`,
      [uid, sourceXml, configSha, String(variant.variant_label || '').trim() || null, assetId, observedAt]);
    uidVariants++;
  }

  let equippedObservations = 0, equippedRejected = 0;
  for (const row of liveEvidence.equipped || []) {
    const avatarId = String(row.avatarId || '').trim();
    const uid = String(row.itemInstanceUid || '').trim();
    const sourceXml = String(row.itemDefinitionSourceXml || '').trim();
    const evidenceSha = String(row.evidenceSha256 || '').trim();
    if (!avatarId || !uid || !sourceXml || !/^[a-f0-9]{64}$/.test(evidenceSha)) {
      equippedRejected++;
      continue;
    }
    const [avatar, definition] = await Promise.all([
      client.query('SELECT 1 FROM avatars WHERE avatar_id=$1', [avatarId]),
      client.query('SELECT 1 FROM item_definitions WHERE source_xml=$1', [sourceXml])
    ]);
    if (!avatar.rowCount || !definition.rowCount) { equippedRejected++; continue; }
    const observedAt = safeTime(row.observedAt, now);
    await client.query(`INSERT INTO item_instances
      (uid,item_definition_source_xml,first_observed_at,last_observed_at)
      VALUES ($1,$2,$3,$3) ON CONFLICT (uid) DO NOTHING`, [uid, sourceXml, observedAt]);
    await client.query(`INSERT INTO temporal_observations
      (observation_id,relationship,avatar_id,item_definition_source_xml,item_instance_uid,
       observed_at,valid_from,confidence,source_key,capture_id,crawler_id,evidence_sha256)
      VALUES ($1,'equipped',$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (observation_id) DO NOTHING`, [
      `rtmp:${evidenceSha}`, avatarId, sourceXml, uid, observedAt,
      Math.max(0, Math.min(100, Math.round(Number(row.confidence || 0) * 100))),
      row.sourceKey || 'rtmp-explicit-wearing-event', row.captureId || null,
      row.crawlerId || null, evidenceSha
    ]);
    equippedObservations++;
  }

  let avatarSpaceObservations = 0, avatarSpaceRejected = 0;
  for (const row of liveEvidence.avatarLocations || []) {
    const avatarId = String(row.avatarId || '').trim();
    const spaceId = String(row.spaceId || '').trim();
    const evidenceSha = String(row.evidenceSha256 || '').trim();
    if (!avatarId || !spaceId || !/^[a-f0-9]{64}$/.test(evidenceSha)) {
      avatarSpaceRejected++;
      continue;
    }
    const [avatar, space] = await Promise.all([
      client.query('SELECT 1 FROM avatars WHERE avatar_id=$1', [avatarId]),
      client.query('SELECT 1 FROM spaces WHERE space_id=$1', [spaceId])
    ]);
    if (!avatar.rowCount || !space.rowCount) { avatarSpaceRejected++; continue; }
    await client.query(`INSERT INTO avatar_space_observations
      (observation_id,avatar_id,space_id,observed_at,source_key,capture_id,crawler_id,evidence_sha256)
      VALUES ($1,$2,$3,$4,'popular-single-room-generation',$5,$6,$7)
      ON CONFLICT (observation_id) DO NOTHING`, [
      `popular:${evidenceSha}`, avatarId, spaceId, safeTime(row.observedAt, now),
      row.captureId, String(row.captureId || '').split('-').slice(0, 2).join('-') || null,
      evidenceSha
    ]);
    avatarSpaceObservations++;
  }

  report.processed = { avatars, spaces, items, itemInstances: instances, avatarConfigSnapshots: configSnapshots,
    uidVariantRenders: uidVariants, equippedObservations, avatarSpaceObservations, ownerAvatarRelationships: 0 };
  const canonicalCounts = await client.query(`SELECT
    (SELECT count(*) FROM avatars)::int AS avatars,
    (SELECT count(*) FROM spaces)::int AS spaces,
    (SELECT count(*) FROM item_definitions)::int AS items,
    (SELECT count(*) FROM item_instances)::int AS "itemInstances",
    (SELECT count(*) FROM avatar_config_snapshots)::int AS "avatarConfigSnapshots",
    (SELECT count(*) FROM uid_variant_renders WHERE status='rendered')::int AS "uidVariantRenders",
    (SELECT count(*) FROM temporal_observations WHERE relationship='equipped')::int AS "equippedObservations",
    (SELECT count(*) FROM avatar_space_observations)::int AS "avatarSpaceObservations",
    (SELECT count(*) FROM owner_avatar_relationships)::int AS "ownerAvatarRelationships"`);
  report.accepted = canonicalCounts.rows[0];
  report.rejected = { avatarsWithoutNameOrLocalPortrait: avatarRejected, spacesWithoutNameOrVerifiedImage: spaceRejected,
    nonRareOrIconlessItems: itemRejected, uidVariantRenders: uidVariantRejected,
    heuristicOwnerAvatarRelationships: heuristicRelationships, equippedObservations: equippedRejected,
    avatarSpaceObservations: avatarSpaceRejected };
  report.finishedAt = new Date().toISOString();
  await client.query('COMMIT');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, report: reportPath, ...report }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
