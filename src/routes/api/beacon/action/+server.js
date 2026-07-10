import { json } from '@sveltejs/kit';
import { spawn, execFile } from 'child_process';

function ghost(cmd) {
  spawn('ghostty', ['-e', 'bash', '-lc', cmd], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}

function ssh(script, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      'ssh',
      ['-o', 'ClearAllForwardings=yes', 'casa', 'bash', '-lc', script],
      { timeout },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout,
          stderr,
          error: err?.message ?? null
        });
      }
    );
  });
}

export async function POST({ request }) {
  const { action } = await request.json();

  if (action === 'grab-session') {
    ghost('$HOME/SmallverseLab/session/grab-session.sh; exec bash');
    return json({ ok: true, message: 'Session grabber opened.' });
  }

  if (action === 'ssh') {
    ghost('ssh -o ClearAllForwardings=yes casa; exec bash');
    return json({ ok: true, message: 'SSH opened.' });
  }

  if (action === 'logs') {
    ghost("ssh -o ClearAllForwardings=yes casa 'journalctl -fu smallverse-explorer.service'; exec bash");
    return json({ ok: true, message: 'Logs opened.' });
  }

  if (action === 'safe-run') {
    ghost("ssh -o ClearAllForwardings=yes casa 'cd /opt/smallverse && /opt/smallverse/beacon-safe-run.sh'; exec bash");
    return json({ ok: true, message: 'Safe crawler opened.' });
  }

  if (action === 'render-icons') {
    ghost("ssh -o ClearAllForwardings=yes casa 'cd /opt/smallverse && /opt/smallverse/beacon-render-icons.sh'; exec bash");
    return json({ ok: true, message: 'Renderer opened.' });
  }

  const scripts = {
    'stop-run': "systemctl stop smallverse-explorer.service",
    'timer-off': "systemctl stop smallverse-explorer.timer; systemctl disable smallverse-explorer.timer",
    'timer-on': "systemctl enable smallverse-explorer.timer; systemctl start smallverse-explorer.timer",
    'test-gateway': "cd /opt/smallverse && source /opt/smallverse/.venv/bin/activate && python -m smallverse_core.active_probe_lab_cli spintowin-prices --token-file /opt/smallverse/probe-lab-connect/svsid.txt --cookie-file /opt/smallverse/probe-lab-connect/cookie.txt",
    'oom-check': "dmesg -T | grep -i -E 'killed process|out of memory|oom-kill' | tail -30",
    'disk': "du -sh /opt/smallverse/workspace /opt/smallverse/workspace/headless-runs /opt/smallverse/workspace/asset-cache 2>/dev/null; df -h /",
    'spin-files': "find /opt/smallverse/workspace -maxdepth 4 -type f | grep -iE 'spin|zoltar|summary|session|ledger|transaction' | head -80"
  };

  if (!scripts[action]) {
    return json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }

  const result = await ssh(scripts[action]);
  return json({
    ok: result.ok,
    message: result.stdout || result.stderr || result.error || 'Done.'
  });
}
