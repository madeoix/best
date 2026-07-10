import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

const home = os.homedir();
const lab = path.join(home, 'SmallverseLab');

const commands = {
  capture: ['wireshark'],
  database: ['sqlitebrowser'],
  workspace: ['code', lab],
  files: ['xdg-open', lab],
  terminal: ['ghostty'],
  vps: ['ghostty', '-e', 'bash', '-lc', 'ssh casa; exec bash'],
  casa: ['xdg-open', 'http://localhost:8181']
};

export async function POST({ request }) {
  const { tool } = await request.json();
  const cmd = commands[tool];

  if (!cmd) {
    return json({ ok: false, error: `Unknown tool: ${tool}` }, { status: 400 });
  }

  spawn(cmd[0], cmd.slice(1), {
    detached: true,
    stdio: 'ignore'
  }).unref();

  return json({ ok: true });
}
