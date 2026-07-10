import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const composeFile = path.join(root, 'infra', 'compose.dev.yml');
const action = process.argv[2];

if (!['up', 'down', 'logs'].includes(action)) {
  console.error('Usage: node scripts/dev-infra.mjs <up|down|logs>');
  process.exit(2);
}

function probe(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore'
  }).status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`
    );
  }
}

function composeFrontend() {
  if (probe('docker', ['compose', 'version'])) {
    return ['docker', ['compose']];
  }

  if (probe('docker-compose', ['version'])) {
    return ['docker-compose', []];
  }

  return null;
}

function composeArgs(frontend, operation) {
  const [, prefix] = frontend;

  if (operation === 'up') {
    return [
      ...prefix,
      '-f',
      composeFile,
      'up',
      '-d',
      '--wait'
    ];
  }

  if (operation === 'down') {
    return [
      ...prefix,
      '-f',
      composeFile,
      'down'
    ];
  }

  return [
    ...prefix,
    '-f',
    composeFile,
    'logs',
    '-f'
  ];
}

function containerExists(name) {
  return probe('docker', ['container', 'inspect', name]);
}

function ensureVolume(name) {
  if (!probe('docker', ['volume', 'inspect', name])) {
    run('docker', ['volume', 'create', name]);
  }
}

function ensureContainer(name, args) {
  if (containerExists(name)) {
    run('docker', ['start', name]);
    return;
  }

  run('docker', ['run', '-d', '--name', name, ...args]);
}

function waitForPostgres(name) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{.State.Health.Status}}',
        name
      ],
      {
        cwd: root,
        encoding: 'utf8'
      }
    );

    const status = String(result.stdout ?? '').trim();

    if (status === 'healthy') {
      console.log('PostgreSQL is healthy.');
      return;
    }

    if (status === 'unhealthy') {
      run('docker', ['logs', '--tail', '100', name]);
      throw new Error('PostgreSQL became unhealthy.');
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }

  run('docker', ['logs', '--tail', '100', name]);
  throw new Error('Timed out waiting for PostgreSQL.');
}

function directUp() {
  if (!probe('docker', ['info'])) {
    throw new Error(
      'Docker is unavailable. Start Docker, or install the Docker Compose plugin.'
    );
  }

  ensureVolume('smallverse-postgres-dev-data');
  ensureVolume('smallverse-minio-dev-data');

  ensureContainer('smallverse-postgres-dev', [
    '--restart',
    'unless-stopped',
    '--env',
    'POSTGRES_DB=smallverse',
    '--env',
    'POSTGRES_USER=smallverse',
    '--env',
    'POSTGRES_PASSWORD=smallverse-development-only',
    '--publish',
    '127.0.0.1:5432:5432',
    '--volume',
    'smallverse-postgres-dev-data:/var/lib/postgresql',
    '--health-cmd',
    'pg_isready -U smallverse -d smallverse',
    '--health-interval',
    '5s',
    '--health-timeout',
    '3s',
    '--health-retries',
    '20',
    'postgres:18.4'
  ]);

  ensureContainer('smallverse-minio-dev', [
    '--restart',
    'unless-stopped',
    '--env',
    'MINIO_ROOT_USER=smallverse',
    '--env',
    'MINIO_ROOT_PASSWORD=smallverse-development-only',
    '--publish',
    '127.0.0.1:9000:9000',
    '--publish',
    '127.0.0.1:9001:9001',
    '--volume',
    'smallverse-minio-dev-data:/data',
    'minio/minio:latest',
    'server',
    '/data',
    '--console-address',
    ':9001'
  ]);

  waitForPostgres('smallverse-postgres-dev');
}

function directDown() {
  for (const name of [
    'smallverse-postgres-dev',
    'smallverse-minio-dev'
  ]) {
    if (containerExists(name)) {
      run('docker', ['rm', '-f', name]);
    }
  }
}

async function directLogs() {
  const names = [
    'smallverse-postgres-dev',
    'smallverse-minio-dev'
  ].filter(containerExists);

  if (!names.length) {
    throw new Error('No Smallverse development containers exist.');
  }

  const children = names.map((name) =>
    spawn('docker', ['logs', '-f', '--tail', '100', name], {
      cwd: root,
      stdio: 'inherit'
    })
  );

  const stop = () => {
    for (const child of children) child.kill('SIGTERM');
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', resolve);
        })
    )
  );
}

const frontend = composeFrontend();

if (frontend) {
  const [command] = frontend;
  run(command, composeArgs(frontend, action));
} else if (action === 'up') {
  directUp();
} else if (action === 'down') {
  directDown();
} else {
  await directLogs();
}
