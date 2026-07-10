import { writable, get } from 'svelte/store';
import { getBeaconWorld, getSpaceProfile } from '$lib/beacon/api.js';

const initialState = {
  world: null,
  loading: false,
  error: '',
  loaded: false,

  selectedSpace: null,
  profileOpen: false,
  profileLoading: false,
  profileError: '',
  profile: null
};

export const worldStore = writable(initialState);

function patch(next) {
  worldStore.update((state) => ({ ...state, ...next }));
}

export async function loadWorld({ force = false } = {}) {
  const state = get(worldStore);

  if (!force && state.loaded && state.world) {
    return state.world;
  }

  patch({ loading: true, error: '' });

  try {
    const world = await getBeaconWorld();
    patch({
      world,
      loading: false,
      loaded: true,
      selectedSpace: world?.sections?.market?.[0] || world?.spaces?.[0] || null
    });

    return world;
  } catch (err) {
    patch({
      loading: false,
      error: err?.message || 'Failed to load Beacon world.'
    });

    return null;
  }
}

export function selectSpace(space) {
  patch({ selectedSpace: space });
}

export async function openSpaceProfile(space) {
  if (!space?.space_id) {
    patch({
      selectedSpace: space,
      profileOpen: true,
      profile: null,
      profileError: 'This space has no space_id, so Beacon cannot load a live profile yet.'
    });
    return null;
  }

  patch({
    selectedSpace: space,
    profileOpen: true,
    profileLoading: true,
    profileError: '',
    profile: null
  });

  try {
    const profile = await getSpaceProfile(space.space_id);

    patch({
      profile,
      profileLoading: false
    });

    return profile;
  } catch (err) {
    patch({
      profileLoading: false,
      profileError: err?.message || 'Failed to load space profile.'
    });

    return null;
  }
}

export function closeSpaceProfile() {
  patch({
    profileOpen: false,
    profileError: '',
    profileLoading: false
  });
}
