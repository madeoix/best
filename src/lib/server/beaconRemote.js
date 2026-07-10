import { execFile } from 'child_process';

export function ssh(script, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      'ssh',
      ['-o', 'ClearAllForwardings=yes', 'casa', 'bash', '-lc', script],
      {
        timeout,
        maxBuffer: 1024 * 1024 * 20
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout || '',
          stderr: stderr || '',
          error: err?.message ?? null
        });
      }
    );
  });
}

export function extractJson(stdout = '') {
  const trimmed = stdout.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');

  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}
