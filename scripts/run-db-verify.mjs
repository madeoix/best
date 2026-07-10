import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://smallverse:smallverse-development-only@127.0.0.1:5432/smallverse';
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npm, ['run', 'db:migrate']);
run(process.execPath, ['scripts/verify-postgres.mjs']);
