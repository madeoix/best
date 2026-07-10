import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import os from 'os';

const base = path.join(os.homedir(), 'SmallverseLab');

const groups = {
  captures: ['.pcap', '.pcapng'],
  har: ['.har'],
  saz: ['.saz'],
  sqlite: ['.sqlite', '.db'],
  xml: ['.xml']
};

function latest(dir, exts) {
  const full = path.join(base, dir);
  if (!fs.existsSync(full)) return null;

  const files = fs.readdirSync(full)
    .filter((f) => exts.some((ext) => f.toLowerCase().endsWith(ext)))
    .map((f) => {
      const p = path.join(full, f);
      const s = fs.statSync(p);
      return { name: f, path: p, mtime: s.mtimeMs, size: s.size };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return files[0] ?? null;
}

export function GET() {
  return json({
    captures: latest('captures', groups.captures),
    har: latest('har', groups.har),
    saz: latest('saz', groups.saz),
    sqlite: latest('sqlite', groups.sqlite),
    xml: latest('xml', groups.xml)
  });
}
