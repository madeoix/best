import { get, writable } from 'svelte/store';
import {
  getObservatoryItem,
  getObservatoryStatus,
  searchObservatory
} from '$lib/beacon/api.js';

export function createObservatoryStore() {
  const status = writable(null);
  const query = writable('');
  const results = writable([]);
  const loading = writable(false);
  const error = writable('');
  const selected = writable(null);
  const itemLoading = writable(false);

  async function loadStatus() {
    try {
      status.set(await getObservatoryStatus());
    } catch (err) {
      status.set({
        ok: false,
        error: err?.message || 'Failed to load Observatory status.'
      });
    }
  }

  async function runSearch(nextQuery = get(query)) {
    query.set(nextQuery);
    loading.set(true);
    error.set('');
    selected.set(null);

    try {
      const data = await searchObservatory(nextQuery, 60);

      if (!data.ok) {
        results.set([]);
        error.set(data.error || 'Observatory search failed.');
      } else {
        results.set(data.items || []);
      }
    } catch (err) {
      results.set([]);
      error.set(err?.message || 'Observatory search failed.');
    }

    loading.set(false);
  }

  async function openItem(item) {
    itemLoading.set(true);

    selected.set({
      ok: false,
      item,
      summary: {
        source_xml: item.source_xml,
        observation_count: item.observed_count,
        uid_count: item.uid_count,
        owner_count: item.owner_count,
        latest_seen: item.latest_seen
      },
      observations: [],
      uid_history: [],
      variant_visuals: []
    });

    try {
      const data = await getObservatoryItem(item.source_xml);

      if (data.ok) {
        selected.set(data);
      } else {
        selected.update((current) => ({
          ...current,
          error: data.error || 'Item detail unavailable.'
        }));
      }
    } catch (err) {
      selected.update((current) => ({
        ...current,
        error: err?.message || 'Item detail unavailable.'
      }));
    }

    itemLoading.set(false);
  }

  function closeItem() {
    selected.set(null);
  }

  async function init() {
    await loadStatus();
    await runSearch('');
  }

  return {
    status,
    query,
    results,
    loading,
    error,
    selected,
    itemLoading,

    loadStatus,
    runSearch,
    openItem,
    closeItem,
    init
  };
}
