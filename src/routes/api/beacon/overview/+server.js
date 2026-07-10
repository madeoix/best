import { json } from '@sveltejs/kit';
import { execFile } from 'child_process';

function ssh(script, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(
      'ssh',
      ['-o', 'ClearAllForwardings=yes', 'casa', 'bash', '-lc', script],
      { timeout },
      (err, stdout, stderr) => resolve({ ok: !err, stdout, stderr, error: err?.message ?? null })
    );
  });
}

export async function GET() {
  const script = `
set +e
echo '---SERVICE---'
systemctl show smallverse-explorer.service -p ActiveState -p SubState -p Result -p ExecMainStatus -p MemoryPeak -p MainPID
echo '---TIMER---'
systemctl is-active smallverse-explorer.timer
systemctl is-enabled smallverse-explorer.timer 2>/dev/null
echo '---SESSION---'
sudo ls -lah /opt/smallverse/probe-lab-connect/cookie.txt /opt/smallverse/probe-lab-connect/svsid.txt 2>/dev/null
sudo python3 - <<'PY'
from pathlib import Path
p=Path('/opt/smallverse/probe-lab-connect/cookie.txt')
if p.exists():
    s=p.read_text(errors='ignore').strip()
    print('cookie_length=' + str(len(s)))
    print('has_jsessionid=' + str('JSESSIONID=' in s))
    print('has_swsid=' + str('SWSID=' in s))
PY
echo '---WORKSPACE---'
du -sh /opt/smallverse/workspace 2>/dev/null
du -sh /opt/smallverse/workspace/headless-runs 2>/dev/null
ls -1td /opt/smallverse/workspace/headless-runs/runs/* 2>/dev/null | head -5
echo '---OBSERVATORY---'
test -f /opt/smallverse/workspace/observatory-sync.json && echo observatory_sync=yes || echo observatory_sync=no
test -f /opt/smallverse/workspace/latest-status.json && echo latest_status=yes || echo latest_status=no
ls /opt/smallverse/workspace/observatory-variant-icons 2>/dev/null | wc -l
echo '---OOM---'
dmesg -T | grep -i -E 'killed process|out of memory|oom-kill' | tail -8
`;

  const result = await ssh(script);
  return json(result);
}
