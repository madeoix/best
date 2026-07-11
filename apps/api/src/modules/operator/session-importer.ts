import {
  mkdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import type { OperatorSessionImport } from '@smallverse/contracts';
import { HttpError } from '../../lib/errors.js';

function cookieValue(cookie: string, name: string): string {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie);
  return match?.[1]?.trim() ?? '';
}

async function atomicWriteBatch(
  entries: Array<{
    filename: string;
    value: string;
    mode?: number;
  }>
): Promise<void> {
  const staged: Array<{
    temporary: string;
    filename: string;
  }> = [];

  try {
    for (const entry of entries) {
      const temporary =
        `${entry.filename}.partial-${process.pid}-${Date.now()}-${staged.length}`;
      await writeFile(temporary, entry.value, {
        mode: entry.mode ?? 0o600,
        flag: 'wx'
      });
      staged.push({
        temporary,
        filename: entry.filename
      });
    }

    // cookie.txt is the compatibility commit marker. Replace it last so
    // readers never see a new cookie before the token and metadata files.
    staged.sort((left, right) =>
      Number(left.filename.endsWith('cookie.txt')) -
      Number(right.filename.endsWith('cookie.txt'))
    );

    for (const entry of staged) {
      await rename(entry.temporary, entry.filename);
    }
  } catch (error) {
    await Promise.all(
      staged.map((entry) =>
        rm(entry.temporary, { force: true }).catch(() => undefined)
      )
    );
    throw error;
  }
}

export class OperatorSessionImporter {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async importSession(input: OperatorSessionImport) {
    const cookie = input.cookie.trim();
    const jsessionid = cookieValue(cookie, 'JSESSIONID');
    const swsid = cookieValue(cookie, 'SWSID');

    if (!jsessionid || !swsid) {
      throw new HttpError(
        400,
        'SESSION_COOKIE_INCOMPLETE',
        'The imported session must contain both JSESSIONID and SWSID.'
      );
    }

    await mkdir(this.#root, {
      recursive: true,
      mode: 0o700
    });

    const capturedAt = input.capturedAt || new Date().toISOString();
    const metadata = {
      label: input.label || input.avatarName || 'Imported session',
      avatar_name: input.avatarName || input.label || null,
      captured_at: capturedAt,
      cookie_length: cookie.length,
      fingerprint:
        `${jsessionid.slice(0, 6)}…${jsessionid.slice(-4)}`
    };

    await atomicWriteBatch([
      {
        filename: path.join(this.#root, 'jsessionid.txt'),
        value: `${jsessionid}\n`
      },
      {
        filename: path.join(this.#root, 'svsid.txt'),
        value: `${swsid}\n`
      },
      {
        filename: path.join(this.#root, 'session.json'),
        value: `${JSON.stringify(metadata, null, 2)}\n`
      },
      {
        filename: path.join(this.#root, 'cookie.txt'),
        value: `${cookie}\n`
      }
    ]);

    return {
      ready: true,
      cookieLength: cookie.length,
      capturedAt,
      label: metadata.label,
      fingerprint: metadata.fingerprint
    };
  }
}
