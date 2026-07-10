import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';

const commands = {
  ssh: ['ghostty', '-e', 'bash', '-lc', 'ssh casa; exec bash'],
  logs: ['ghostty', '-e', 'bash', '-lc', "ssh -o ClearAllForwardings=yes casa 'journalctl -fu smallverse-explorer.service'; exec bash"],
  restart: ['ghostty', '-e', 'bash', '-lc', "ssh -o ClearAllForwardings=yes casa 'systemctl restart smallverse-explorer.service; systemctl status smallverse-explorer.service --no-pager -l'; exec bash"],
  status: ['ghostty', '-e', 'bash', '-lc', "ssh -o ClearAllForwardings=yes casa 'systemctl status smallverse-explorer.service --no-pager -l'; exec bash"],
  casaos: ['xdg-open', 'http://localhost:8181']
};

export async function POST({ request }) {
  const { action } = await request.json();
  const cmd = commands[action];

  if (!cmd) return json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });

  spawn(cmd[0], cmd.slice(1), { detached: true, stdio: 'ignore' }).unref();
  return json({ ok: true });
}
