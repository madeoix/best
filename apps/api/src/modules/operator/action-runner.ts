import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { OperatorActionName } from '@smallverse/contracts';
import { HttpError } from '../../lib/errors.js';

const execute = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandExecutor {
  run(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeoutMs?: number;
      maxBuffer?: number;
    }
  ): Promise<CommandResult>;
}

export class ExecFileCommandExecutor implements CommandExecutor {
  async run(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      timeoutMs?: number;
      maxBuffer?: number;
    } = {}
  ): Promise<CommandResult> {
    const { stdout, stderr } = await execute(command, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      timeout: options.timeoutMs ?? 30_000,
      maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024
    });

    return {
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? '')
    };
  }
}

export interface OperatorActionRunnerOptions {
  smallverseRoot: string;
  workspaceRoot: string;
  systemctlCommand: string[];
  privilegedCommand: string[];
  executor?: CommandExecutor;
}

const SPIN_FILE_PATTERN =
  /spin|zoltar|summary|session|ledger|transaction/i;

async function collectMatchingFiles(
  root: string,
  maxDepth: number,
  limit: number
): Promise<string[]> {
  const output: string[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || output.length >= limit) return;

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (output.length >= limit) break;

      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
      } else if (entry.isFile() && SPIN_FILE_PATTERN.test(entry.name)) {
        output.push(absolute);
      }
    }
  }

  await walk(root, 0);
  return output;
}

export class OperatorActionRunner {
  readonly #smallverseRoot: string;
  readonly #workspaceRoot: string;
  readonly #systemctlCommand: string[];
  readonly #privilegedCommand: string[];
  readonly #executor: CommandExecutor;

  constructor(options: OperatorActionRunnerOptions) {
    this.#smallverseRoot = path.resolve(options.smallverseRoot);
    this.#workspaceRoot = path.resolve(options.workspaceRoot);
    this.#systemctlCommand = [...options.systemctlCommand];
    this.#privilegedCommand = [...options.privilegedCommand];
    this.#executor = options.executor ?? new ExecFileCommandExecutor();

    if (this.#systemctlCommand.length === 0) {
      throw new Error('systemctl command must not be empty');
    }

    if (this.#privilegedCommand.length === 0) {
      throw new Error('privileged command must not be empty');
    }
  }

  async #systemctl(args: string[]): Promise<CommandResult> {
    const [command, ...prefix] = this.#systemctlCommand;

    return this.#executor.run(command!, [...prefix, ...args], {
      timeoutMs: 30_000
    });
  }


  async #runPrivileged(
    command: string,
    args: string[],
    cwd?: string
  ): Promise<CommandResult> {
    const [binary, ...prefix] = this.#privilegedCommand;

    return this.#executor.run(
      binary!,
      [...prefix, command, ...args],
      {
        ...(cwd ? { cwd } : {}),
        timeoutMs: 120_000,
        maxBuffer: 8 * 1024 * 1024
      }
    );
  }

  async #runFixed(
    command: string,
    args: string[],
    cwd?: string
  ): Promise<CommandResult> {
    return this.#executor.run(command, args, {
      ...(cwd ? { cwd } : {}),
      timeoutMs: 120_000,
      maxBuffer: 8 * 1024 * 1024
    });
  }

  async run(action: OperatorActionName): Promise<{
    action: OperatorActionName;
    message: string;
  }> {
    try {
      let output = '';

      switch (action) {
        case 'stop-run': {
          const result = await this.#systemctl([
            'stop',
            'smallverse-explorer.service'
          ]);
          output = result.stdout || result.stderr || 'Explorer stopped.';
          break;
        }

        case 'timer-off': {
          const stop = await this.#systemctl([
            'stop',
            'smallverse-explorer.timer'
          ]);
          const disable = await this.#systemctl([
            'disable',
            'smallverse-explorer.timer'
          ]);
          output = [
            stop.stdout,
            stop.stderr,
            disable.stdout,
            disable.stderr,
            'Explorer timer disabled.'
          ].filter(Boolean).join('\n');
          break;
        }

        case 'timer-on': {
          const enable = await this.#systemctl([
            'enable',
            'smallverse-explorer.timer'
          ]);
          const start = await this.#systemctl([
            'start',
            'smallverse-explorer.timer'
          ]);
          output = [
            enable.stdout,
            enable.stderr,
            start.stdout,
            start.stderr,
            'Explorer timer enabled.'
          ].filter(Boolean).join('\n');
          break;
        }

        case 'test-gateway': {
          const python = path.join(
            this.#smallverseRoot,
            '.venv',
            'bin',
            'python'
          );
          const result = await this.#runPrivileged(
            python,
            [
              '-m',
              'smallverse_core.active_probe_lab_cli',
              'spintowin-prices',
              '--token-file',
              path.join(
                this.#smallverseRoot,
                'probe-lab-connect',
                'svsid.txt'
              ),
              '--cookie-file',
              path.join(
                this.#smallverseRoot,
                'probe-lab-connect',
                'cookie.txt'
              )
            ],
            this.#smallverseRoot
          );
          output = result.stdout || result.stderr;
          break;
        }

        case 'oom-check': {
          const result = await this.#runPrivileged(
            '/usr/bin/dmesg',
            ['--ctime']
          );
          output = result.stdout
            .split('\n')
            .filter((line) =>
              /killed process|out of memory|oom-kill/i.test(line))
            .slice(-30)
            .join('\n') || 'No recent OOM records found.';
          break;
        }

        case 'disk': {
          const paths = [
            this.#workspaceRoot,
            path.join(this.#workspaceRoot, 'headless-runs'),
            path.join(this.#workspaceRoot, 'asset-cache')
          ];

          const existing: string[] = [];
          for (const candidate of paths) {
            try {
              await stat(candidate);
              existing.push(candidate);
            } catch {
              // Preserve missing paths as diagnostics rather than failing.
            }
          }

          const du = existing.length
            ? await this.#runFixed('/usr/bin/du', ['-sh', ...existing])
            : { stdout: '', stderr: 'No configured workspace paths exist.' };
          const df = await this.#runFixed('/usr/bin/df', ['-h', '/']);
          output = [du.stdout, du.stderr, df.stdout, df.stderr]
            .filter(Boolean)
            .join('\n');
          break;
        }

        case 'spin-files': {
          const files = await collectMatchingFiles(
            this.#workspaceRoot,
            4,
            80
          );
          output = files.length
            ? files.join('\n')
            : 'No matching spin, Zoltar, summary, session, ledger, or transaction files found.';
          break;
        }

        case 'safe-run': {
          const script = path.join(
            this.#smallverseRoot,
            'beacon-safe-run.sh'
          );
          const result = await this.#runPrivileged(
            script,
            [],
            this.#smallverseRoot
          );
          output = result.stdout || result.stderr;
          break;
        }

        case 'render-icons': {
          const script = path.join(
            this.#smallverseRoot,
            'beacon-render-icons.sh'
          );
          const result = await this.#runPrivileged(
            script,
            [],
            this.#smallverseRoot
          );
          output = result.stdout || result.stderr;
          break;
        }

        default: {
          const neverAction: never = action;
          throw new Error(`Unsupported operator action: ${neverAction}`);
        }
      }

      return {
        action,
        message: output.trim() || 'Action completed.'
      };
    } catch (error) {
      throw new HttpError(
        502,
        'OPERATOR_ACTION_FAILED',
        `The ${action} operator action failed.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
