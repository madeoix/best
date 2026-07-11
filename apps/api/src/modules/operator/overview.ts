import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ServiceControl } from './service-control.js';
import type { CommandExecutor } from './action-runner.js';

export interface OperatorOverviewOptions {
  smallverseRoot: string;
  workspaceRoot: string;
  remoteSessionRoot: string;
  systemctlCommand: string[];
  services: ServiceControl;
  executor: CommandExecutor;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await stat(filename);
    return true;
  } catch {
    return false;
  }
}

async function readSessionMetadata(root: string) {
  const cookiePath = path.join(root, 'cookie.txt');
  const sessionPath = path.join(root, 'session.json');
  let cookie = '';
  let metadata: Record<string, unknown> = {};

  try {
    cookie = (await readFile(cookiePath, 'utf8')).trim();
  } catch {
    // Missing session is a valid operational state.
  }

  try {
    metadata = JSON.parse(await readFile(sessionPath, 'utf8'));
  } catch {
    // Metadata is optional.
  }

  return {
    ready:
      cookie.includes('JSESSIONID=') &&
      cookie.includes('SWSID='),
    cookieLength: cookie.length,
    hasJsessionId: cookie.includes('JSESSIONID='),
    hasSwsid: cookie.includes('SWSID='),
    label:
      String(
        metadata.label ??
        metadata.avatar_name ??
        metadata.avatar ??
        ''
      ) || null,
    capturedAt:
      String(
        metadata.captured_at ??
        metadata.updated_at ??
        ''
      ) || null
  };
}

async function directoryCount(directory: string): Promise<number> {
  try {
    return (await readdir(directory)).length;
  } catch {
    return 0;
  }
}

export class OperatorOverview {
  constructor(private readonly options: OperatorOverviewOptions) {}

  async read() {
    const [
      explorer,
      admin,
      session,
      observatorySync,
      latestStatus,
      variantIconCount
    ] = await Promise.all([
      this.options.services.status('smallverse-explorer.service')
        .catch((error) => ({ error: error.message })),
      this.options.services.status('smallverse-admin.service')
        .catch((error) => ({ error: error.message })),
      readSessionMetadata(this.options.remoteSessionRoot),
      exists(path.join(this.options.workspaceRoot, 'observatory-sync.json')),
      exists(path.join(this.options.workspaceRoot, 'latest-status.json')),
      directoryCount(
        path.join(this.options.workspaceRoot, 'observatory-variant-icons')
      )
    ]);

    const [systemctl, ...prefix] = this.options.systemctlCommand;
    let timer = {
      active: 'unknown',
      enabled: 'unknown'
    };

    try {
      const active = await this.options.executor.run(
        systemctl!,
        [...prefix, 'is-active', 'smallverse-explorer.timer'],
        { timeoutMs: 10_000 }
      );
      const enabled = await this.options.executor.run(
        systemctl!,
        [...prefix, 'is-enabled', 'smallverse-explorer.timer'],
        { timeoutMs: 10_000 }
      );
      timer = {
        active: active.stdout.trim() || active.stderr.trim() || 'unknown',
        enabled:
          enabled.stdout.trim() || enabled.stderr.trim() || 'unknown'
      };
    } catch {
      // Overview remains available when the timer is absent.
    }

    return {
      services: {
        explorer,
        admin
      },
      timer,
      session,
      workspace: {
        root: this.options.workspaceRoot,
        observatorySync,
        latestStatus,
        variantIconCount
      }
    };
  }
}
