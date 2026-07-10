import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../../lib/errors.js';

export interface LegacyDataStoreOptions {
  workspaceRoot: string;
  automationRoot: string;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export class LegacyDataStore {
  readonly #workspaceRoot: string;
  readonly #automationRoot: string;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(options: LegacyDataStoreOptions) {
    this.#workspaceRoot = options.workspaceRoot;
    this.#automationRoot = options.automationRoot;
  }

  async #readJson<T>(filename: string, ttlMs = 15_000): Promise<T> {
    const cached = this.#cache.get(filename);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    let raw: string;

    try {
      raw = await readFile(filename, 'utf8');
    } catch (error) {
      throw new HttpError(
        503,
        'LEGACY_DATA_UNAVAILABLE',
        `Preserved data is unavailable: ${path.basename(filename)}`,
        error instanceof Error ? error.message : String(error)
      );
    }

    let value: T;

    try {
      value = JSON.parse(raw) as T;
    } catch (error) {
      throw new HttpError(
        500,
        'LEGACY_DATA_INVALID',
        `Preserved data is not valid JSON: ${path.basename(filename)}`,
        error instanceof Error ? error.message : String(error)
      );
    }

    this.#cache.set(filename, {
      expiresAt: Date.now() + ttlMs,
      value
    });

    return value;
  }

  worldPath(): string {
    return path.join(this.#workspaceRoot, 'beacon-world-index.json');
  }

  observatoryCandidates(): string[] {
    return [
      path.join(this.#workspaceRoot, 'observatory-sync.json'),
      path.join(this.#automationRoot, 'observatory-sync.json')
    ];
  }

  async #firstExisting(candidates: string[]): Promise<string> {
    for (const candidate of candidates) {
      try {
        await stat(candidate);
        return candidate;
      } catch {
        // Try the next preserved source.
      }
    }

    throw new HttpError(
      503,
      'LEGACY_DATA_UNAVAILABLE',
      'No preserved Observatory export was found.',
      { candidates }
    );
  }

  async getWorld(): Promise<Record<string, unknown>> {
    return this.#readJson<Record<string, unknown>>(
      this.worldPath(),
      60_000
    );
  }

  async getObservatory(): Promise<Record<string, unknown>> {
    const filename = await this.#firstExisting(
      this.observatoryCandidates()
    );

    return this.#readJson<Record<string, unknown>>(filename, 30_000);
  }

  async getObservatoryStatus() {
    const filename = await this.#firstExisting(
      this.observatoryCandidates()
    );
    const info = await stat(filename);
    const data = await this.#readJson<Record<string, unknown>>(
      filename,
      30_000
    );

    const list = (name: string): unknown[] =>
      Array.isArray(data[name]) ? data[name] as unknown[] : [];

    return {
      ok: true,
      source: 'observatory-sync.json',
      generated_at:
        typeof data.generated_at === 'string'
          ? data.generated_at
          : typeof data.updated_at === 'string'
            ? data.updated_at
            : null,
      file_modified_unix: info.mtimeMs / 1000,
      counts: {
        assets: list('assets').length,
        observations: list('observations').length,
        uid_change_events: list('uid_change_events').length,
        variant_visuals: list('variant_visuals').length
      }
    };
  }

  async searchObservatory(query: string, limit: number) {
    const data = await this.getObservatory();
    const assets = Array.isArray(data.assets)
      ? data.assets as Array<Record<string, unknown>>
      : [];
    const observations = Array.isArray(data.observations)
      ? data.observations as Array<Record<string, unknown>>
      : [];

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const observationCounts = new Map<string, number>();
    const owners = new Map<string, Set<string>>();
    const uids = new Map<string, Set<string>>();
    const latest = new Map<string, string>();

    for (const observation of observations) {
      const source = String(
        observation.source_xml ??
        observation.xml ??
        ''
      );

      if (!source) continue;

      observationCounts.set(
        source,
        (observationCounts.get(source) ?? 0) + 1
      );

      const owner = String(
        observation.owner_id ??
        observation.owner ??
        ''
      );
      const uid = String(
        observation.uid ??
        observation.instance_uid ??
        ''
      );
      const observedAt = String(
        observation.observed_at ??
        observation.updated_at ??
        ''
      );

      if (owner) {
        const set = owners.get(source) ?? new Set<string>();
        set.add(owner);
        owners.set(source, set);
      }

      if (uid) {
        const set = uids.get(source) ?? new Set<string>();
        set.add(uid);
        uids.set(source, set);
      }

      if (observedAt > (latest.get(source) ?? '')) {
        latest.set(source, observedAt);
      }
    }

    const items = assets
      .map((asset) => {
        const source = String(asset.source_xml ?? asset.xml ?? '');
        const name = String(
          asset.name ??
          asset.display_name ??
          asset.title ??
          source.split('/').at(-1) ??
          source
        );
        const haystack = [
          name,
          source,
          asset.description,
          asset.category,
          asset.type,
          asset.tags
        ]
          .map((value) => String(value ?? ''))
          .join(' ')
          .toLocaleLowerCase();

        if (normalizedQuery && !haystack.includes(normalizedQuery)) {
          return null;
        }

        return {
          source_xml: source,
          name,
          description: asset.description ?? null,
          category: asset.category ?? asset.type ?? null,
          tags: asset.tags ?? null,
          icon:
            asset.variant_icon ??
            asset.icon ??
            asset.rendered_icon ??
            null,
          variant_icon: asset.variant_icon ?? null,
          variant_render_status:
            asset.variant_render_status ?? null,
          observed_count:
            Number(asset.observed_count) ||
            observationCounts.get(source) ||
            0,
          uid_count: uids.get(source)?.size ?? 0,
          owner_count: owners.get(source)?.size ?? 0,
          latest_seen: latest.get(source) ?? null,
          is_rare: Boolean(asset.is_rare),
          currency: asset.currency ?? null,
          xml_price: asset.xml_price ?? asset.price ?? null
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) =>
        right.observed_count - left.observed_count ||
        right.uid_count - left.uid_count ||
        right.owner_count - left.owner_count ||
        String(right.latest_seen ?? '').localeCompare(
          String(left.latest_seen ?? '')
        )
      )
      .slice(0, limit);

    return {
      ok: true,
      source: 'observatory-sync.json',
      query,
      count: items.length,
      items,
      generated_at:
        typeof data.generated_at === 'string'
          ? data.generated_at
          : typeof data.updated_at === 'string'
            ? data.updated_at
            : null
    };
  }
}
