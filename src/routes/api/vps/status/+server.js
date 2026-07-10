import { json } from '@sveltejs/kit';
import { execFile } from 'child_process';

function run(args) {
  return new Promise((resolve) => {
    execFile('ssh', ['-o', 'ClearAllForwardings=yes', 'casa', ...args], { timeout: 12000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr, error: err?.message ?? null });
    });
  });
}

function parseShow(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
}

export async function GET() {
  const show = await run(['systemctl show smallverse-explorer.service -p ActiveState -p SubState -p Result -p ExecMainStatus']);
  const logs = await run(['journalctl -u smallverse-explorer.service -n 20 --no-pager']);
  const system = await run(['bash', '-lc', "uptime; echo '---'; free -h; echo '---'; df -h /"]);
  const files = await run(['bash', '-lc', "find /opt/smallverse/workspace -maxdepth 3 -type f | wc -l"]);

  return json({
    service: parseShow(show.stdout),
    logs: logs.stdout,
    system: system.stdout,
    workspaceFiles: files.stdout.trim()
  });
}
