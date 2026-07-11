import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const SERVICE_ENVIRONMENTS = Object.freeze({
  public: {
    filename: 'public-api.env',
    required: [
      'NODE_ENV',
      'SMALLVERSE_VERSION',
      'SMALLVERSE_LOG_LEVEL',
      'SMALLVERSE_PUBLIC_HOST',
      'SMALLVERSE_PUBLIC_PORT',
      'SMALLVERSE_WORKSPACE',
      'SMALLVERSE_AUTOMATION_ROOT',
      'SMALLVERSE_PUBLIC_DIR'
    ]
  },
  operator: {
    filename: 'operator-api.env',
    required: [
      'NODE_ENV',
      'SMALLVERSE_VERSION',
      'SMALLVERSE_LOG_LEVEL',
      'SMALLVERSE_OPERATOR_HOST',
      'SMALLVERSE_OPERATOR_PORT',
      'SMALLVERSE_OPERATOR_SCOPES',
      'SMALLVERSE_OPERATOR_TOKEN',
      'SMALLVERSE_OPERATOR_SERVICES',
      'SMALLVERSE_SYSTEMCTL_COMMAND',
      'SMALLVERSE_PRIVILEGED_COMMAND',
      'SMALLVERSE_ROOT',
      'SMALLVERSE_REMOTE_SESSION_ROOT',
      'SMALLVERSE_WORKSPACE',
      'SMALLVERSE_AUTOMATION_ROOT',
      'SMALLVERSE_PUBLIC_DIR'
    ]
  },
  worker: {
    filename: 'worker.env',
    required: [
      'NODE_ENV',
      'SMALLVERSE_VERSION',
      'SMALLVERSE_LOG_LEVEL',
      'SMALLVERSE_WORKER_ENABLED',
      'SMALLVERSE_WORKER_ID',
      'SMALLVERSE_WORKER_POLL_MS',
      'SMALLVERSE_WORKSPACE',
      'SMALLVERSE_AUTOMATION_ROOT',
      'SMALLVERSE_PUBLIC_DIR'
    ]
  }
});

const PLACEHOLDER = /(?:replace(?:[-_ ]with)?[-_ ](?:me|git|confirmed|at)|change[-_ ]?me|example\.com|__[_A-Z]+__|<[^>]+>)/i;
const SAFE_LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const EXPECTED_SERVICES = [
  'smallverse-explorer.service',
  'smallverse-admin.service'
];
const EXPECTED_SCOPES = [
  'services:read',
  'services:write',
  'operations:read',
  'operations:write',
  'sessions:write',
  'audit:read'
];

function finding(severity, code, message, key = null) {
  return { severity, code, message, key };
}

function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvironmentText(text) {
  const values = {};
  const findings = [];
  const seen = new Set();

  for (const [offset, rawLine] of String(text).split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^export\s+/.test(trimmed)) {
      findings.push(finding(
        'blocker',
        'ENV_EXPORT_UNSUPPORTED',
        `Line ${lineNumber} uses export; systemd EnvironmentFile entries must be KEY=value.`
      ));
      continue;
    }

    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) {
      findings.push(finding(
        'blocker',
        'ENV_LINE_INVALID',
        `Line ${lineNumber} is not a valid KEY=value entry.`
      ));
      continue;
    }

    const [, key, rawValue] = match;
    if (seen.has(key)) {
      findings.push(finding(
        'blocker',
        'ENV_KEY_DUPLICATE',
        `${key} is declared more than once.`,
        key
      ));
      continue;
    }

    seen.add(key);
    const value = unquote(rawValue.trim());

    if (/\$\(|`/.test(value)) {
      findings.push(finding(
        'blocker',
        'ENV_COMMAND_SUBSTITUTION',
        `${key} contains command-substitution syntax.`,
        key
      ));
    }

    if (/\r|\n|\0/.test(value)) {
      findings.push(finding(
        'blocker',
        'ENV_CONTROL_CHARACTER',
        `${key} contains a control character.`,
        key
      ));
    }

    values[key] = value;
  }

  return { values, findings };
}

function list(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function integer(value) {
  if (!/^\d+$/.test(String(value ?? ''))) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isAbsoluteUnder(value, root) {
  if (!value || !path.isAbsolute(value)) return false;
  const relative = path.relative(root, value);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isLoopbackHost(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(String(host ?? '').trim());
}

export function isTailscaleHost(host) {
  const value = String(host ?? '').trim().toLowerCase();
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return false;
    return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  }

  return value.startsWith('fd7a:115c:a1e0:');
}

function validateDatabaseUrl(value, findings) {
  if (!value) return;

  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('not PostgreSQL');
    }
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
      findings.push(finding(
        'warning',
        'DATABASE_NOT_LOOPBACK',
        'DATABASE_URL does not target the local PostgreSQL listener.',
        'DATABASE_URL'
      ));
    }
    if (!parsed.username || !parsed.pathname || parsed.pathname === '/') {
      throw new Error('missing role or database');
    }
  } catch {
    findings.push(finding(
      'blocker',
      'DATABASE_URL_INVALID',
      'DATABASE_URL must be a complete PostgreSQL URL.',
      'DATABASE_URL'
    ));
  }
}

export function validateEnvironment(service, values, options = {}) {
  const descriptor = SERVICE_ENVIRONMENTS[service];
  if (!descriptor) throw new Error(`Unknown production service: ${service}`);

  const findings = [];
  const expectedCommit = options.expectedCommit?.trim() || null;

  for (const key of descriptor.required) {
    if (!String(values[key] ?? '').trim()) {
      findings.push(finding(
        'blocker',
        'ENV_REQUIRED_MISSING',
        `${key} is required for the ${service} service.`,
        key
      ));
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (PLACEHOLDER.test(String(value))) {
      findings.push(finding(
        'blocker',
        'ENV_PLACEHOLDER',
        `${key} still contains a template placeholder.`,
        key
      ));
    }
  }

  if (values.NODE_ENV !== 'production') {
    findings.push(finding(
      'blocker',
      'NODE_ENV_NOT_PRODUCTION',
      'NODE_ENV must equal production.',
      'NODE_ENV'
    ));
  }

  if (!SAFE_LOG_LEVELS.has(values.SMALLVERSE_LOG_LEVEL)) {
    findings.push(finding(
      'blocker',
      'LOG_LEVEL_INVALID',
      'SMALLVERSE_LOG_LEVEL is not recognized.',
      'SMALLVERSE_LOG_LEVEL'
    ));
  }

  if (expectedCommit && values.SMALLVERSE_VERSION !== expectedCommit) {
    findings.push(finding(
      'blocker',
      'RELEASE_VERSION_MISMATCH',
      'SMALLVERSE_VERSION does not match the release commit.',
      'SMALLVERSE_VERSION'
    ));
  }

  for (const key of ['SMALLVERSE_WORKSPACE', 'SMALLVERSE_AUTOMATION_ROOT']) {
    if (!isAbsoluteUnder(values[key], '/opt/smallverse')) {
      findings.push(finding(
        'blocker',
        'PRESERVATION_PATH_INVALID',
        `${key} must be an absolute path under /opt/smallverse.`,
        key
      ));
    }
  }

  if (!isAbsoluteUnder(values.SMALLVERSE_PUBLIC_DIR, '/var/www') &&
      !isAbsoluteUnder(values.SMALLVERSE_PUBLIC_DIR, '/srv/smallverse')) {
    findings.push(finding(
      'blocker',
      'PUBLIC_PATH_INVALID',
      'SMALLVERSE_PUBLIC_DIR must be under /var/www or /srv/smallverse.',
      'SMALLVERSE_PUBLIC_DIR'
    ));
  }

  validateDatabaseUrl(values.DATABASE_URL, findings);

  if (service === 'public') {
    if (!isLoopbackHost(values.SMALLVERSE_PUBLIC_HOST)) {
      findings.push(finding(
        'blocker',
        'PUBLIC_HOST_NOT_LOOPBACK',
        'The public API must bind to loopback in production.',
        'SMALLVERSE_PUBLIC_HOST'
      ));
    }

    if (integer(values.SMALLVERSE_PUBLIC_PORT) !== 8780) {
      findings.push(finding(
        'blocker',
        'PUBLIC_PORT_UNEXPECTED',
        'SMALLVERSE_PUBLIC_PORT must equal 8780 for the tracked Nginx configuration.',
        'SMALLVERSE_PUBLIC_PORT'
      ));
    }
  }

  if (service === 'operator') {
    const host = values.SMALLVERSE_OPERATOR_HOST;
    if (!isLoopbackHost(host) && !isTailscaleHost(host)) {
      findings.push(finding(
        'blocker',
        'OPERATOR_HOST_NOT_PRIVATE',
        'The operator API must bind to loopback or a Tailscale address.',
        'SMALLVERSE_OPERATOR_HOST'
      ));
    }

    if (integer(values.SMALLVERSE_OPERATOR_PORT) !== 8781) {
      findings.push(finding(
        'blocker',
        'OPERATOR_PORT_UNEXPECTED',
        'SMALLVERSE_OPERATOR_PORT must equal 8781.',
        'SMALLVERSE_OPERATOR_PORT'
      ));
    }

    if (String(values.SMALLVERSE_OPERATOR_TOKEN ?? '').length < 32) {
      findings.push(finding(
        'blocker',
        'OPERATOR_TOKEN_TOO_SHORT',
        'SMALLVERSE_OPERATOR_TOKEN must contain at least 32 characters.',
        'SMALLVERSE_OPERATOR_TOKEN'
      ));
    }

    const services = list(values.SMALLVERSE_OPERATOR_SERVICES).sort();
    if (JSON.stringify(services) !== JSON.stringify([...EXPECTED_SERVICES].sort())) {
      findings.push(finding(
        'blocker',
        'OPERATOR_SERVICE_ALLOWLIST_CHANGED',
        'SMALLVERSE_OPERATOR_SERVICES must match the reviewed two-service allowlist.',
        'SMALLVERSE_OPERATOR_SERVICES'
      ));
    }

    const scopes = list(values.SMALLVERSE_OPERATOR_SCOPES).sort();
    if (JSON.stringify(scopes) !== JSON.stringify([...EXPECTED_SCOPES].sort())) {
      findings.push(finding(
        'blocker',
        'OPERATOR_SCOPE_ALLOWLIST_CHANGED',
        'SMALLVERSE_OPERATOR_SCOPES must exactly match the reviewed scope allowlist.',
        'SMALLVERSE_OPERATOR_SCOPES'
      ));
    }

    if (values.SMALLVERSE_SYSTEMCTL_COMMAND !== '/usr/bin/sudo,-n,/usr/bin/systemctl') {
      findings.push(finding(
        'blocker',
        'SYSTEMCTL_COMMAND_CHANGED',
        'SMALLVERSE_SYSTEMCTL_COMMAND does not match the reviewed sudo boundary.',
        'SMALLVERSE_SYSTEMCTL_COMMAND'
      ));
    }

    if (values.SMALLVERSE_PRIVILEGED_COMMAND !== '/usr/bin/sudo,-n') {
      findings.push(finding(
        'blocker',
        'PRIVILEGED_COMMAND_CHANGED',
        'SMALLVERSE_PRIVILEGED_COMMAND does not match the reviewed sudo boundary.',
        'SMALLVERSE_PRIVILEGED_COMMAND'
      ));
    }

    if (values.SMALLVERSE_ROOT !== '/opt/smallverse') {
      findings.push(finding(
        'blocker',
        'SMALLVERSE_ROOT_CHANGED',
        'SMALLVERSE_ROOT must remain /opt/smallverse.',
        'SMALLVERSE_ROOT'
      ));
    }

    if (!isAbsoluteUnder(values.SMALLVERSE_REMOTE_SESSION_ROOT, '/opt/smallverse')) {
      findings.push(finding(
        'blocker',
        'SESSION_ROOT_INVALID',
        'SMALLVERSE_REMOTE_SESSION_ROOT must remain under /opt/smallverse.',
        'SMALLVERSE_REMOTE_SESSION_ROOT'
      ));
    }
  }

  if (service === 'worker') {
    if (values.SMALLVERSE_WORKER_ENABLED !== 'false') {
      findings.push(finding(
        'blocker',
        'WORKER_NOT_DISABLED',
        'SMALLVERSE_WORKER_ENABLED must remain false until ingestion is separately approved.',
        'SMALLVERSE_WORKER_ENABLED'
      ));
    }

    const poll = integer(values.SMALLVERSE_WORKER_POLL_MS);
    if (poll === null || poll < 1000) {
      findings.push(finding(
        'blocker',
        'WORKER_POLL_INVALID',
        'SMALLVERSE_WORKER_POLL_MS must be an integer of at least 1000.',
        'SMALLVERSE_WORKER_POLL_MS'
      ));
    }
  }

  return findings;
}

export async function inspectEnvironmentFile(service, filename, options = {}) {
  const text = await readFile(filename, 'utf8');
  const parsed = parseEnvironmentText(text);
  const findings = [
    ...parsed.findings,
    ...validateEnvironment(service, parsed.values, options)
  ];
  let metadata = null;

  if (!options.skipMetadata) {
    const info = await lstat(filename);
    const mode = info.mode & 0o777;
    metadata = {
      modeOctal: mode.toString(8).padStart(4, '0'),
      uid: info.uid,
      gid: info.gid,
      sizeBytes: info.size
    };

    if ((mode & 0o077) !== 0) {
      findings.push(finding(
        'blocker',
        'ENV_FILE_PERMISSIONS',
        `${filename} must use mode 0600 or stricter.`
      ));
    }

    if (info.uid !== 0 || info.gid !== 0) {
      findings.push(finding(
        'blocker',
        'ENV_FILE_OWNER',
        `${filename} must be owned by root:root.`
      ));
    }
  }

  return {
    service,
    filename,
    keys: Object.keys(parsed.values).sort(),
    metadata,
    findings
  };
}
