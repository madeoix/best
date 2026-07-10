import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import {
  getObservatoryStatus,
  searchObservatory,
  prefetchItemProfiles
} from '$lib/beacon/api.js';

const STORAGE_KEY = 'smallverse.beacon.state.v1';

const initialState = {
  status: null,
  statusLoaded: false,
  statusLoading: false,

  query: '',
  results: [],
  selected: null,

  loading: false,
  error: '',
  hasSearched: false,

  profileDialogOpen: false,
  profileDialogItem: null
};

function readPersistedState() {
  if (!browser) return {};

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);

    return {
      query: parsed.query || '',
      results: Array.isArray(parsed.results) ? parsed.results : [],
      selected: parsed.selected || null,
      status: parsed.status || null,
      statusLoaded: !!parsed.statusLoaded,
      hasSearched: !!parsed.hasSearched,
      profileDialogOpen: !!parsed.profileDialogOpen,
      profileDialogItem: parsed.profileDialogItem || null
    };
  } catch {
    return {};
  }
}

export const beaconState = writable({
  ...initialState,
  ...readPersistedState()
});

let searchRequestId = 0;
let statusRequestId = 0;

if (browser) {
  beaconState.subscribe((state) => {
    const payload = {
      query: state.query,
      results: state.results,
      selected: state.selected,
      status: state.status,
      statusLoaded: state.statusLoaded,
      hasSearched: state.hasSearched,
      profileDialogOpen: state.profileDialogOpen,
      profileDialogItem: state.profileDialogItem
    };

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  });
}

function patch(partial) {
  beaconState.update((state) => ({
    ...state,
    ...partial
  }));
}

export function setBeaconQuery(query) {
  patch({ query });
}

export function selectBeaconItem(item) {
  patch({ selected: item || null });
}

export function openBeaconProfile(item) {
  if (!item) return;

  patch({
    selected: item,
    profileDialogItem: item,
    profileDialogOpen: true
  });

  prefetchItemProfiles([item], 1);
}

export function closeBeaconProfile() {
  patch({
    profileDialogOpen: false
  });
}

export async function loadBeaconStatus({ force = false } = {}) {
  const current = get(beaconState);

  if (!force && (current.statusLoaded || current.statusLoading)) {
    return current.status;
  }

  const requestId = ++statusRequestId;

  patch({
    statusLoading: true
  });

  try {
    const status = await getObservatoryStatus();

    if (requestId !== statusRequestId) return get(beaconState).status;

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

    if (requestId !== statusRequestId) return get(beaconState).status;

    patch({
      status,
      statusLoaded: true,
      statusLoading: false
    });

    return status;
  }
}

export async function runBeaconSearch(nextQuery = get(beaconState).query, { force = true } = {}) {
  const current = get(beaconState);
  const query = String(nextQuery || '');

  if (!force && current.hasSearched && query === current.query && current.results.length) {
    prefetchItemProfiles(current.results, 8);
    return current.results;
  }

  const requestId = ++searchRequestId;

  patch({
    query,
    loading: true,
    error: ''
  });

  try {
    const data = await searchObservatory(query, 18);

    if (requestId !== searchRequestId) return get(beaconState).results;

    if (!data.ok) {
      patch({
        results: [],
        selected: null,
        loading: false,
        hasSearched: true,
        error: data.error || 'Search failed.'
      });

      return [];
    }

    const results = data.items || [];
    const previousSelected = get(beaconState).selected;
    const selected =
      results.find((item) => item.source_xml === previousSelected?.source_xml) ||
      results[0] ||
      null;

    patch({
      results,
      selected,
      loading: false,
      hasSearched: true,
      error: ''
    });

    prefetchItemProfiles(results, 8);

    return results;
  } catch (err) {
    if (requestId !== searchRequestId) return get(beaconState).results;

    patch({
      results: [],
      selected: null,
      loading: false,
      hasSearched: true,
      error: err?.message || 'Search failed.'
    });

    return [];
  }
}

export async function ensureBeaconHomeLoaded() {
  const current = get(beaconState);

  await loadBeaconStatus();

  if (!current.hasSearched) {
    await runBeaconSearch(current.query || '', { force: true });
  } else if (current.results.length) {
    prefetchItemProfiles(current.results, 8);
  }
}

export function resetBeaconSearch() {
  patch({
    query: '',
    results: [],
    selected: null,
    loading: false,
    error: '',
    hasSearched: false
  });

  if (browser) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
