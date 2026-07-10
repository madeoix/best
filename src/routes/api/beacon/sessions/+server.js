import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
const BASE = join(homedir(), 'SmallverseLab/session');
const PROFILES = join(BASE, 'profiles');

function fingerprint(cookie = '') {
  const js = cookie.match(/JSESSIONID=([^;]+)/)?.[1] || '';
  const sw = cookie.match(/SWSID=([^;]+)/)?.[1] || '';
  return {
    jsessionid: js,
    swsid: sw,
    short: js ? `${js.slice(0, 6)}…${js.slice(-4)}` : 'none',
    has_jsessionid: !!js,
    has_swsid: !!sw
  };
}

async function exists(path) {
  try { await fs.access(path); return true; } catch { return false; }
}

async function readCurrent() {
  await fs.mkdir(BASE, { recursive: true });
  await fs.mkdir(PROFILES, { recursive: true });

  const cookiePath = join(BASE, 'cookie.txt');
  const jsonPath = join(BASE, 'session.json');

  const cookie = await exists(cookiePath) ? (await fs.readFile(cookiePath, 'utf8')).trim() : '';
  let meta = {};
  if (await exists(jsonPath)) {
    try { meta = JSON.parse(await fs.readFile(jsonPath, 'utf8')); } catch {}
  }

  const fp = fingerprint(cookie);

  return {
    label: meta.label || meta.avatar_name || meta.avatar || 'Unknown avatar',
    avatar_name: meta.avatar_name || meta.avatar || null,
    captured_at: meta.captured_at || meta.updated_at || null,
    cookie_length: cookie.length,
    cookie_path: cookiePath,
    session_json_path: jsonPath,
    fingerprint: fp.short,
    has_jsessionid: fp.has_jsessionid,
    has_swsid: fp.has_swsid,
    ready: fp.has_jsessionid && fp.has_swsid,
    source: cookie ? 'local cookie.txt' : 'missing'
  };
}

async function readProfiles() {
  await fs.mkdir(PROFILES, { recursive: true });
  const files = (await fs.readdir(PROFILES)).filter(f => f.endsWith('.json'));

  const profiles = [];
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(join(PROFILES, file), 'utf8'));
      const fp = fingerprint(data.cookie || '');
      profiles.push({
        id: file.replace(/\.json$/, ''),
        label: data.label || data.avatar_name || file.replace(/\.json$/, ''),
        avatar_name: data.avatar_name || null,
        captured_at: data.captured_at || null,
        cookie_length: (data.cookie || '').length,
        fingerprint: fp.short,
        ready: fp.has_jsessionid && fp.has_swsid
      });
    } catch {}
  }

  return profiles.sort((a, b) => (b.captured_at || '').localeCompare(a.captured_at || ''));
}

function slug(s) {
  return String(s || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'session';
}

async function writeActiveFromCookie(cookie, meta = {}) {
  await fs.mkdir(BASE, { recursive: true });
  const fp = fingerprint(cookie);

  await fs.writeFile(join(BASE, 'cookie.txt'), cookie + '\n', { mode: 0o600 });
  if (fp.jsessionid) await fs.writeFile(join(BASE, 'jsessionid.txt'), fp.jsessionid + '\n', { mode: 0o600 });
  if (fp.swsid) await fs.writeFile(join(BASE, 'svsid.txt'), fp.swsid + '\n', { mode: 0o600 });

  await fs.writeFile(join(BASE, 'session.json'), JSON.stringify({
    ...meta,
    captured_at: meta.captured_at || new Date().toISOString(),
    cookie_length: cookie.length,
    fingerprint: fp.short
  }, null, 2) + '\n', { mode: 0o600 });
}

async function syncToCasa() {
  const cookiePath = join(BASE, 'cookie.txt');

  await exec('scp', [
    '-o', 'ClearAllForwardings=yes',
    cookiePath,
    'casa:/tmp/beacon-cookie.txt'
  ]);

  await exec('ssh', [
    '-o', 'ClearAllForwardings=yes',
    'casa',
    `sudo mkdir -p /opt/smallverse/probe-lab-connect &&
     sudo cp /tmp/beacon-cookie.txt /opt/smallverse/probe-lab-connect/cookie.txt &&
     sudo chmod 600 /opt/smallverse/probe-lab-connect/cookie.txt &&
     sudo python3 - <<'PY'
from pathlib import Path
import re
base = Path('/opt/smallverse/probe-lab-connect')
cookie = (base / 'cookie.txt').read_text().strip()
js = re.search(r'JSESSIONID=([^;]+)', cookie)
sw = re.search(r'SWSID=([^;]+)', cookie)
if js: (base / 'jsessionid.txt').write_text(js.group(1) + '\\n')
if sw: (base / 'svsid.txt').write_text(sw.group(1) + '\\n')
for p in ['cookie.txt','jsessionid.txt','svsid.txt']:
    f = base / p
    if f.exists(): f.chmod(0o600)
print('synced')
PY`
  ]);
}

export async function GET() {
  return json({
    ok: true,
    current: await readCurrent(),
    profiles: await readProfiles()
  });
}

export async function POST({ request }) {
  const body = await request.json();
  const action = body.action;

  if (action === 'save-current') {
    const label = body.label || 'Session';
    const cookiePath = join(BASE, 'cookie.txt');
    const cookie = (await fs.readFile(cookiePath, 'utf8')).trim();
    const id = slug(label);
    const data = {
      id,
      label,
      avatar_name: body.avatar_name || label,
      captured_at: new Date().toISOString(),
      cookie
    };
    await fs.mkdir(PROFILES, { recursive: true });
    await fs.writeFile(join(PROFILES, `${id}.json`), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    return json({ ok: true, message: `saved ${label}` });
  }

  if (action === 'switch') {
    const id = body.id;
    const profile = JSON.parse(await fs.readFile(join(PROFILES, `${id}.json`), 'utf8'));
    await writeActiveFromCookie(profile.cookie, {
      label: profile.label,
      avatar_name: profile.avatar_name,
      captured_at: profile.captured_at
    });
    return json({ ok: true, message: `switched to ${profile.label}` });
  }

  if (action === 'sync') {
    await syncToCasa();
    return json({ ok: true, message: 'synced active session to casa' });
  }

  return json({ ok: false, error: 'unknown session action' }, { status: 400 });
}
