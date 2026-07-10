import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  OperatorServiceName
} from '@smallverse/contracts';
import { HttpError } from '../../lib/errors.js';

const execute = promisify(execFile);

export interface ServiceControlOptions {
  allowedServices: string[];
  timeoutMs?: number;
  command?: string[];
}

export class ServiceControl {
  readonly #allowedServices: Set<string>;
  readonly #timeoutMs: number;
  readonly #command: string[];

  constructor(options: ServiceControlOptions) {
    this.#allowedServices = new Set(options.allowedServices);
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#command = options.command ?? ['/usr/bin/systemctl'];

    if (this.#command.length === 0) {
      throw new Error('ServiceControl command must not be empty');
    }
  }

  #assertAllowed(service: string): asserts service is OperatorServiceName {
    if (!this.#allowedServices.has(service)) {
      throw new HttpError(
        404,
        'SERVICE_NOT_ALLOWED',
        'The requested service is not available to the operator API.'
      );
    }
  }

  async status(service: string) {
    this.#assertAllowed(service);

    try {
      const [binary, ...prefix] = this.#command;
      const { stdout } = await execute(
        binary!,
        [
          ...prefix,
          'show',
          service,
          '--property=Id',
          '--property=LoadState',
          '--property=ActiveState',
          '--property=SubState',
          '--property=Result',
          '--property=ExecMainStatus',
          '--property=MainPID',
          '--property=MemoryCurrent',
          '--no-pager'
        ],
        {
          timeout: this.#timeoutMs,
          maxBuffer: 512 * 1024
        }
      );

      return Object.fromEntries(
        stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const index = line.indexOf('=');
            return index === -1
              ? [line, '']
              : [line.slice(0, index), line.slice(index + 1)];
          })
      );
    } catch (error) {
      throw new HttpError(
        502,
        'SERVICE_STATUS_FAILED',
        `Could not read ${service}.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async restart(service: string) {
    this.#assertAllowed(service);

    try {
      const [binary, ...prefix] = this.#command;
      await execute(
        binary!,
        [...prefix, 'restart', service],
        {
          timeout: this.#timeoutMs,
          maxBuffer: 512 * 1024
        }
      );
    } catch (error) {
      throw new HttpError(
        502,
        'SERVICE_RESTART_FAILED',
        `Could not restart ${service}.`,
        error instanceof Error ? error.message : String(error)
      );
    }

    return this.status(service);
  }
}
