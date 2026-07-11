import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function commandSucceeds(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options
  });

  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr
    ].join('\n')
  );

  return result;
}

test('runtime JavaScript entry scripts parse', () => {
  for (const script of [
    'scripts/dev-runtime.mjs',
    'scripts/dev-desktop.mjs',
    'scripts/dev-infra.mjs',
    'scripts/run-db-verify.mjs',
    'scripts/smoke-runtime.mjs',
    'scripts/verify-postgres.mjs',
    'scripts/production-audit.mjs',
    'scripts/evaluate-production-audit.mjs',
    'scripts/smoke-production.mjs',
    'scripts/verify-production-release.mjs',
    'scripts/package-release.mjs',
    'scripts/audit-dependencies.mjs',
    'scripts/production-deploy.mjs',
    'scripts/production-doctor.mjs',
    'scripts/validate-production-env.mjs',
    'scripts/verify-installed-release.mjs',
    'scripts/verify-release-lifecycle.mjs',
    'scripts/verify-toolchain.mjs',
    'scripts/write-dependency-inventory.mjs',
    'scripts/verify-lockfile-portability.mjs',
    'scripts/lib/production-config.mjs',
    'scripts/lib/production-release.mjs'
  ]) {
    commandSucceeds(process.execPath, ['--check', script]);
  }
});

test('preservation export sync shell script parses', () => {
  commandSucceeds('bash', [
    '-n',
    'scripts/sync-preserved-exports.sh'
  ]);
});

test('sync script prefers the published lite Observatory read model', () => {
  const source = readFileSync(
    'scripts/sync-preserved-exports.sh',
    'utf8'
  );

  assert.match(
    source,
    /\/var\/www\/smallverse\/observatory-sync-lite\.json/
  );
  assert.match(source, /test -s/);
  assert.match(source, /trap cleanup_active EXIT/);
  assert.match(source, /if ! scp/);
});

test('desktop launcher owns safe local development defaults', () => {
  const packageJson = JSON.parse(
    readFileSync('package.json', 'utf8')
  );
  const source = readFileSync(
    'scripts/dev-desktop.mjs',
    'utf8'
  );

  assert.equal(
    packageJson.scripts['dev:desktop'],
    'node scripts/dev-desktop.mjs'
  );
  assert.match(
    source,
    /VITE_SMALLVERSE_PUBLIC_API_BASE/
  );
  assert.match(
    source,
    /SMALLVERSE_OPERATOR_API_URL/
  );
  assert.match(
    source,
    /SMALLVERSE_OPERATOR_TOKEN/
  );
  assert.match(source, /\/api\/v1\/health/);
  assert.match(source, /\/_service/);
});

test('runtime launcher preflights development ports', () => {
  const source = readFileSync(
    'scripts/dev-runtime.mjs',
    'utf8'
  );

  assert.match(source, /assertPortAvailable/);
  assert.match(source, /EADDRINUSE/);
  assert.match(source, /already in use/);
});

test('production runtime is pinned and exposes gated operations commands', () => {
  const packageJson = JSON.parse(
    readFileSync('package.json', 'utf8')
  );

  assert.equal(packageJson.engines.node, '24.x');
  assert.equal(packageJson.engines.npm, '11.x');
  assert.equal(packageJson.packageManager, 'npm@11.18.0');
  assert.deepEqual(packageJson.allowScripts, {
    '@hugeicons/svelte': true,
    esbuild: true
  });
  assert.equal(readFileSync('.nvmrc', 'utf8').trim(), '24');
  assert.equal(
    packageJson.scripts['production:audit'],
    'node scripts/production-audit.mjs'
  );
  assert.equal(
    packageJson.scripts['production:smoke'],
    'node scripts/smoke-production.mjs'
  );
  assert.equal(
    packageJson.scripts['release:verify'],
    'node scripts/verify-production-release.mjs'
  );
  assert.equal(
    packageJson.scripts['production:deploy'],
    'node scripts/production-deploy.mjs'
  );
  assert.equal(
    packageJson.scripts['production:doctor'],
    'node scripts/production-doctor.mjs'
  );
  assert.equal(
    packageJson.scripts['release:lifecycle'],
    'node scripts/verify-release-lifecycle.mjs'
  );
});

test('production audit invokes only read-only inspection commands', () => {
  const source = readFileSync(
    'scripts/production-audit.mjs',
    'utf8'
  );

  assert.doesNotMatch(
    source,
    /run\(['"](?:apt|apt-get|dnf|yum)['"]/
  );
  assert.doesNotMatch(
    source,
    /run\(['"]systemctl['"],\s*\[\s*['"](?:start|stop|restart|enable|disable|daemon-reload)['"]/
  );
  assert.doesNotMatch(source, /readFile\([^)]*\/etc\/smallverse/);
  assert.match(source, /commandsExecutedAreReadOnly: true/);
  assert.match(source, /environmentFileContentsRead: false/);
});

test('inventory audit evaluation succeeds for a valid minimal report', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'smallverse-audit-test-')
  );
  const filename = path.join(directory, 'audit.json');
  const commands = Object.fromEntries(
    ['systemctl', 'ss', 'sha256sum', 'tar'].map((name) => [
      name,
      { available: true }
    ])
  );

  writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    mode: 'read-only',
    commands,
    services: {},
    accounts: {},
    runtime: { node: 'v24.0.0' },
    network: { listeners: [], tailscaleIpv4: [] },
    postgres: { ready: false },
    filesystem: {
      paths: {
        '/opt/smallverse': { exists: true }
      },
      preservationDatabases: [
        { exists: true, path: '/opt/smallverse/observatory.sqlite' }
      ]
    }
  }));

  try {
    commandSucceeds(process.execPath, [
      'scripts/evaluate-production-audit.mjs',
      filename,
      '--stage',
      'inventory'
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release packager includes workspace manifests and verifies output', () => {
  const source = readFileSync(
    'scripts/package-release.mjs',
    'utf8'
  );

  assert.match(source, /apps\/api\/package\.json/);
  assert.match(source, /packages\/contracts\/package\.json/);
  assert.match(source, /packages\/database\/package\.json/);
  assert.match(source, /MANIFEST\.sha256/);
  assert.match(source, /verify-production-release\.mjs/);
  assert.match(source, /DEPENDENCY-INVENTORY\.json/);
  assert.match(source, /SECURITY-AUDIT\.json/);
  assert.match(source, /production-deploy\.mjs/);
  assert.match(source, /SMALLVERSE_RELEASE_COMMIT/);
  assert.match(source, /status',\s*'--porcelain'/);
  assert.match(source, /clean Git worktree/);
});

test('production units preserve the source boundary and service identities', () => {
  const publicUnit = readFileSync(
    'infra/systemd/smallverse-public-api.service',
    'utf8'
  );
  const operatorUnit = readFileSync(
    'infra/systemd/smallverse-operator-api.service',
    'utf8'
  );
  const workerUnit = readFileSync(
    'infra/systemd/smallverse-worker.service',
    'utf8'
  );
  const workerEnv = readFileSync(
    'infra/env/worker.env.example',
    'utf8'
  );

  assert.match(publicUnit, /^User=smallverse-public$/m);
  assert.match(operatorUnit, /^User=smallverse-operator$/m);
  assert.match(workerUnit, /^User=smallverse-worker$/m);
  assert.match(
    workerUnit,
    /^ReadOnlyPaths=-\/opt\/smallverse\/workspace$/m
  );
  assert.doesNotMatch(
    workerUnit,
    /^ReadWritePaths=.*\/opt\/smallverse/m
  );
  assert.doesNotMatch(publicUnit, /MemoryDenyWriteExecute=true/);
  assert.doesNotMatch(operatorUnit, /MemoryDenyWriteExecute=true/);
  assert.doesNotMatch(workerUnit, /MemoryDenyWriteExecute=true/);
  assert.match(workerEnv, /^SMALLVERSE_WORKER_ENABLED=false$/m);
  assert.match(operatorUnit, /^ReadWritePaths=-\/srv\/smallverse\/shared\/operator$/m);
  assert.match(workerUnit, /^ReadWritePaths=-\/srv\/smallverse\/shared\/worker$/m);
});

test('shadow Nginx listener cannot claim a public interface', () => {
  const source = readFileSync(
    'infra/nginx/smallverse-lab.shadow.conf.template',
    'utf8'
  );

  assert.match(source, /^\s*listen 127\.0\.0\.1:8088;/m);
  assert.doesNotMatch(source, /^\s*listen (?:80|443|\[::\])/m);
  assert.match(source, /location \^~ \/ops\//);
  assert.doesNotMatch(source, /proxy_pass[^;]*8781/);
  assert.match(source, /location \^~ \/api\//);
  assert.match(source, /location \/avatar-oracles\//);
  assert.match(source, /X-Content-Type-Options/);
});

test('TLS-managed public sites require reviewed fragment integration', () => {
  const fragment = readFileSync(
    'infra/nginx/smallverse-lab.locations.conf.template',
    'utf8'
  );
  const deploy = readFileSync('scripts/production-deploy.mjs', 'utf8');

  assert.doesNotMatch(fragment, /^\s*(?:listen|server_name|ssl_certificate)\b/m);
  assert.match(fragment, /location \^~ \/api\//);
  assert.match(fragment, /location \^~ \/ops\/[\s\S]*return 404/);
  assert.doesNotMatch(fragment, /proxy_pass[^;]*8781/);
  assert.match(deploy, /Refusing to replace TLS-managed Nginx site/);
  assert.match(deploy, /smallverse-lab\.locations\.conf\.template/);
  assert.match(deploy, /ssl_certificate/);
});

test('production deployment mutations are explicit and preservation-safe', () => {
  const source = readFileSync('scripts/production-deploy.mjs', 'utf8');

  assert.match(source, /if \(!options\.apply\) return/);
  assert.match(source, /requireConfirmation/);
  assert.match(source, /INSTALL:/);
  assert.match(source, /archiveDigest\.slice\(0, 12\)/);
  assert.match(source, /Root-private release copy failed SHA-256 verification/);
  assert.match(source, /chmod\(stagedArchive, 0o600\)/);
  assert.match(source, /SWITCH:/);
  assert.match(source, /ACTIVATE:/);
  assert.match(source, /FINALIZE:/);
  assert.match(source, /ROLLBACK:/);
  assert.doesNotMatch(source, /(?:rm|rename|writeFile|copyFile)\([^\n]*\/opt\/smallverse/);
  assert.doesNotMatch(source, /systemctl['"], \[['"](?:start|restart|enable)['"], ['"]smallverse-worker/);
  assert.match(source, /Refusing to finalize while the ingestion worker is active or enabled/);
  assert.match(source, /serviceEnabled/);
  assert.match(source, /--ignore-scripts/);
  assert.match(source, /SMALLVERSE_NPM_BIN: '\/usr\/bin\/npm'/);
  assert.match(source, /automatic|restore/i);
});

test('deployment verifies installed trees with the installed-release verifier', () => {
  const source = readFileSync('scripts/production-deploy.mjs', 'utf8');

  assert.match(source, /function verifyInstalledRelease\(root\)/);
  assert.match(source, /verifyInstalledRelease\(target\)/);
  assert.match(source, /verifyInstalledRelease\(root\)/);
  assert.match(source, /verifyInstalledRelease\(release\)/);
  assert.match(source, /verifyInstalledRelease\(current\)/);
  assert.doesNotMatch(source, /verifyRelease\(target,/);
  assert.doesNotMatch(source, /verifyRelease\(release,/);
  assert.doesNotMatch(source, /verifyRelease\(\s*current,/);
});

test('deployment waits for API readiness before accepting a release', () => {
  const source = readFileSync('scripts/production-deploy.mjs', 'utf8');

  assert.match(source, /async function waitForHttp\(url, headers = \{\}, options = \{\}\)/);
  assert.match(source, /timeoutMs = options\.timeoutMs \?\? 60_000/);
  assert.match(source, /await new Promise\(\(resolve\) => setTimeout\(resolve, sleepMs\)\)/);
  assert.equal((source.match(/await waitForHttp\(/g) ?? []).length, 4);
  assert.doesNotMatch(source, /await httpCheck\('http:\/\/127\.0\.0\.1:8780\/api\/v1\/health'\)/);
});

test('release lifecycle publishes only after production install verification', () => {
  const source = readFileSync('scripts/verify-release-lifecycle.mjs', 'utf8');

  assert.match(source, /verify-installed-release\.mjs/);
  assert.match(source, /SMALLVERSE_CERTIFIED_RELEASE_ROOT/);
  assert.match(source, /copyFile\(packageResult\.archive, certifiedArchive\)/);
  assert.match(source, /sha256sum/);
});

test('database readiness is separate from file-backed shadow readiness', () => {
  const source = readFileSync('scripts/evaluate-production-audit.mjs', 'utf8');

  assert.match(source, /'database'/);
  assert.match(source, /POSTGRES_NOT_READY/);
  assert.match(source, /does not block the file-backed shadow runtime/);
  assert.match(source, /evaluateDatabase/);
});
