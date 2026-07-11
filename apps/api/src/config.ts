import os from 'node:os';
import path from 'node:path';

export interface SharedConfig {
  nodeEnv: 'development' | 'test' | 'production';
  serviceVersion: string;
  logLevel: string;
  workspaceRoot: string;
  automationRoot: string;
  publicDirectory: string;
  databaseUrl?: string;
  allowedOrigins: string[];
}

export interface PublicApiConfig extends SharedConfig {
  host: string;
  port: number;
}

export interface OperatorApiConfig extends SharedConfig {
  host: string;
  port: number;
  operatorToken: string;
  operatorScopes: string[];
  allowedServices: string[];
  systemctlCommand: string[];
  privilegedCommand: string[];
  smallverseRoot: string;
  remoteSessionRoot: string;
}

export interface WorkerConfig extends SharedConfig {
  workerId: string;
  pollIntervalMs: number;
}

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum = 1
): number {
  if (value === undefined || value === '') return fallback;

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }

  return parsed;
}

function nodeEnvironment(
  value: string | undefined
): SharedConfig['nodeEnv'] {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function list(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function shared(env: NodeJS.ProcessEnv): SharedConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  return {
    nodeEnv: nodeEnvironment(env.NODE_ENV),
    serviceVersion: env.SMALLVERSE_VERSION?.trim() || 'development',
    logLevel: env.SMALLVERSE_LOG_LEVEL?.trim() || 'info',
    workspaceRoot:
      env.SMALLVERSE_WORKSPACE?.trim() || '/opt/smallverse/workspace',
    automationRoot:
      env.SMALLVERSE_AUTOMATION_ROOT?.trim() ||
      '/opt/smallverse/automation-workspace',
    publicDirectory:
      env.SMALLVERSE_PUBLIC_DIR?.trim() || '/var/www/smallverse',
    ...(databaseUrl ? { databaseUrl } : {}),
    allowedOrigins: list(env.SMALLVERSE_ALLOWED_ORIGINS)
  };
}

export function loadPublicConfig(
  env: NodeJS.ProcessEnv = process.env
): PublicApiConfig {
  return {
    ...shared(env),
    allowedOrigins: list(
      env.SMALLVERSE_PUBLIC_ALLOWED_ORIGINS ??
      env.SMALLVERSE_ALLOWED_ORIGINS
    ),
    host: env.SMALLVERSE_PUBLIC_HOST?.trim() || '127.0.0.1',
    port: integer(env.SMALLVERSE_PUBLIC_PORT, 8780, 'SMALLVERSE_PUBLIC_PORT')
  };
}

export function loadOperatorConfig(
  env: NodeJS.ProcessEnv = process.env
): OperatorApiConfig {
  const operatorToken = env.SMALLVERSE_OPERATOR_TOKEN?.trim() || '';

  if (nodeEnvironment(env.NODE_ENV) === 'production' && operatorToken.length < 32) {
    throw new Error(
      'SMALLVERSE_OPERATOR_TOKEN must contain at least 32 characters in production'
    );
  }

  return {
    ...shared(env),
    allowedOrigins: list(
      env.SMALLVERSE_OPERATOR_ALLOWED_ORIGINS
    ),
    host: env.SMALLVERSE_OPERATOR_HOST?.trim() || '127.0.0.1',
    port: integer(
      env.SMALLVERSE_OPERATOR_PORT,
      8781,
      'SMALLVERSE_OPERATOR_PORT'
    ),
    operatorToken,
    operatorScopes: list(env.SMALLVERSE_OPERATOR_SCOPES).length
      ? list(env.SMALLVERSE_OPERATOR_SCOPES)
      : [
          'services:read',
          'services:write',
          'operations:read',
          'operations:write',
          'sessions:write',
          'audit:read'
        ],
    allowedServices: list(env.SMALLVERSE_OPERATOR_SERVICES).length
      ? list(env.SMALLVERSE_OPERATOR_SERVICES)
      : [
          'smallverse-explorer.service',
          'smallverse-admin.service'
        ],
    systemctlCommand:
      list(env.SMALLVERSE_SYSTEMCTL_COMMAND).length
        ? list(env.SMALLVERSE_SYSTEMCTL_COMMAND)
        : ['/usr/bin/sudo', '-n', '/usr/bin/systemctl'],
    privilegedCommand:
      list(env.SMALLVERSE_PRIVILEGED_COMMAND).length
        ? list(env.SMALLVERSE_PRIVILEGED_COMMAND)
        : ['/usr/bin/sudo', '-n'],
    smallverseRoot:
      env.SMALLVERSE_ROOT?.trim() || '/opt/smallverse',
    remoteSessionRoot:
      env.SMALLVERSE_REMOTE_SESSION_ROOT?.trim() ||
      '/opt/smallverse/probe-lab-connect'
  };
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env
): WorkerConfig {
  return {
    ...shared(env),
    workerId:
      env.SMALLVERSE_WORKER_ID?.trim() ||
      `${os.hostname()}-${process.pid}`,
    pollIntervalMs: integer(
      env.SMALLVERSE_WORKER_POLL_MS,
      2_000,
      'SMALLVERSE_WORKER_POLL_MS',
      100
    )
  };
}

export function localSessionRoot(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    env.SMALLVERSE_LOCAL_SESSION_ROOT?.trim() ||
    path.join(os.homedir(), 'SmallverseLab', 'session')
  );
}
