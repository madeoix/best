import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import {
  getObservatoryStatus,
  prefetchItemProfiles,
  searchObservatory
} from '$lib/beacon/api.js';

const STORAGE_KEY = 'smallverse.beacon.atlas.v1';

const initialState = {
  status: null,
  statusLoaded: false,
  statusLoading: false,

  query: '',
  preset: 'showcase',
  items: [],
  selected: null,

  loading: false,
  error: '',
  loaded: false,

  profileOpen: false,
  profileItem: null
};

function readPersistedState() {
  if (!browser) return {};

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);

    return {
      status: parsed.status || null,
      statusLoaded: !!parsed.statusLoaded,
      query: parsed.query || '',
      preset: parsed.preset || 'showcase',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      selected: parsed.selected || null,
      loaded: !!parsed.loaded,
      profileOpen: !!parsed.profileOpen,
      profileItem: parsed.profileItem || null
    };
  } catch {
    return {};
  }
}

export const atlasState = writable({
  ...initialState,
  ...readPersistedState()
});

let statusRequestId = 0;
let atlasRequestId = 0;

if (browser) {
  atlasState.subscribe((state) => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          status: state.status,
          statusLoaded: state.statusLoaded,
          query: state.query,
          preset: state.preset,
          items: state.items,
          selected: state.selected,
          loaded: state.loaded,
          profileOpen: state.profileOpen,
          profileItem: state.profileItem
        })
      );
    } catch {
      // ignore storage failures
    }
  });
}

function patch(partial) {
  atlasState.update((state) => ({
    ...state,
    ...partial
  }));
}

export function setAtlasQuery(query) {
  patch({
    query,
    preset: String(query || '').trim() ? 'search' : 'showcase'
  });
}

export function selectAtlasItem(item) {
  patch({ selected: item || null });
}

export function openAtlasProfile(item) {
  if (!item) return;

  patch({
    selected: item,
    profileItem: item,
    profileOpen: true
  });

  prefetchItemProfiles([item], 1);
}

export function closeAtlasProfile() {
  patch({
    profileOpen: false
  });
}

export async function loadAtlasStatus({ force = false } = {}) {
  const current = get(atlasState);

  if (!force && (current.statusLoaded || current.statusLoading)) {
    return current.status;
  }

  const requestId = ++statusRequestId;
  patch({ statusLoading: true });

  try {
    const status = await getObservatoryStatus();

    if (requestId !== statusRequestId) return get(atlasState).status;

    patch({
      status,
      statusLoaded: true,
      statusLoading: false
    });

    return status;
  } catch (err) {
    const status = {
      ok: false,
      error: err?.message || 'Failed to load Observatory status.'
    };

    if (requestId !== statusRequestId) return get(atlasState).status;

    patch({
      status,
      statusLoaded: true,
      statusLoading: false
    });

    return status;
  }
}

export async function loadAtlas(nextQuery = get(atlasState).query, options = {}) {
  const {
    preset = String(nextQuery || '').trim() ? 'search' : 'showcase',
    force = true,
    limit = 300
  } = options;

  const current = get(atlasState);
  const query = String(nextQuery || '');

  if (!force && current.loaded && current.query === query && current.items.length) {
    prefetchItemProfiles(current.items, 12);
    return current.items;
  }

  const requestId = ++atlasRequestId;

  patch({
    query,
    preset,
    loading: true,
    error: ''
  });

  try {
    const data = await searchObservatory(query, limit);

    if (requestId !== atlasRequestId) return get(atlasState).items;

    if (!data.ok) {
      patch({
        items: [],
        selected: null,
        loading: false,
        loaded: true,
        error: data.error || 'Atlas load failed.'
      });

      return [];
    }

    const items = data.items || [];
    const previousSelected = get(atlasState).selected;
    const selected =
      items.find((item) => item.source_xml === previousSelected?.source_xml) ||
      items[0] ||
      null;

    patch({
      items,
      selected,
      loading: false,
      loaded: true,
      error: ''
    });

    prefetchItemProfiles(items, 12);

    return items;
  } catch (err) {
    if (requestId !== atlasRequestId) return get(atlasState).items;

    patch({
      items: [],
      selected: null,
      loading: false,
      loaded: true,
      error: err?.message || 'Atlas load failed.'
    });

    return [];
  }
}

export async function ensureAtlasLoaded() {
  const current = get(atlasState);

  await loadAtlasStatus();

  if (!current.loaded) {
    await loadAtlas(current.query || '', {
      preset: current.preset || 'showcase',
      force: true,
      limit: 300
    });
  } else if (current.items.length) {
    prefetchItemProfiles(current.items, 12);
  }
}

export function loadAtlasPreset(preset) {
  const presets = {
    showcase: '',
    wearables: 'wear',
    creatures: 'animal',
    headwear: 'hat',
    furniture: 'chair',
    props: 'staff',
    rare: 'rare',
    recent: ''
  };

  return loadAtlas(presets[preset] ?? '', {
    preset,
    force: true,
    limit: preset === 'showcase' || preset === 'recent' ? 300 : 160
  });
}
