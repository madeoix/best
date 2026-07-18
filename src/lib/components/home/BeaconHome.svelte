<script>
  import { onDestroy, onMount } from 'svelte';
  import '$lib/styles/beacon.css';

  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';
  import { loadWorld, worldStore } from '$lib/beacon/stores/worldStore.js';

  import {
    beaconState,
    ensureBeaconHomeLoaded,
    openBeaconProfile,
    runBeaconSearch,
    selectBeaconItem,
    setBeaconQuery
  } from '$lib/beacon/beaconState.js';

  import HomeResultIndex from './HomeResultIndex.svelte';
  import HomeFocus from './HomeFocus.svelte';
  import BeaconProfileDialog from './BeaconProfileDialog.svelte';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';

  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let searchTimer;
  let inspectionOpen = false;

  function handleQueryInput(event) {
    const query = event.currentTarget.value;
    setBeaconQuery(query);
    inspectionOpen = false;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runBeaconSearch(query), 180);
  }

  function submitSearch() {
    inspectionOpen = false;
    runBeaconSearch(state.query);
  }

  function inspectItem(item) {
    selectBeaconItem(item);
    inspectionOpen = true;
  }

  function returnToResults() {
    inspectionOpen = false;
  }

  onMount(() => {
    ensureBeaconHomeLoaded();
    loadWorld();
  });

  onDestroy(() => {
    clearTimeout(searchTimer);
  });

  $: state = $beaconState;
  $: counts = state.status?.counts || {};
  $: featuredSpace =
    $worldStore.world?.sections?.market?.[0] ||
    $worldStore.world?.sections?.useful?.[0] ||
    $worldStore.world?.spaces?.[0] ||
    null;
  $: worldImage = featuredSpace?.snapshot_url || featuredSpace?.thumb_url || '';
</script>

<svelte:window on:keydown={(event) => {
  if (event.key === 'Escape' && inspectionOpen) returnToResults();
}} />

<section class="module home-module command-home" class:inspection-mode={inspectionOpen}>
  {#if worldImage}
    <img
      class="command-world-backdrop"
      src={worldImage}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
    />
  {/if}

  <section class="command-shell">
    <header class="command-topline">
      <div>
        <p>OBSERVATORY</p>
        <h1>{inspectionOpen ? state.selected?.name || 'Item inspection' : 'Search Smallverse'}</h1>
        <span>
          {inspectionOpen
            ? 'Inspect the item, then follow its preserved world evidence.'
            : 'Find an item visually, then inspect the preserved evidence behind it.'}
        </span>
      </div>

      <div class="command-truthline">
        {#if state.status?.ok}
          <span class="truth-live">Synced</span>
          <span>{fmtNumber(counts.assets)} assets</span>
          <span>{fmtNumber(counts.observations)} observations</span>
          <span>{fmtDate(state.status.generated_at)}</span>
        {:else if state.statusLoading}
          <span>Checking Observatory…</span>
        {:else}
          <span>Observatory unavailable</span>
        {/if}
      </div>
    </header>

    {#if inspectionOpen && state.selected}
      <section class="inspection-shell">
        <header class="inspection-toolbar">
          <button type="button" class="inspection-back" on:click={returnToResults}>
            ← Back to visual results
          </button>

          <form class="inspection-search" on:submit|preventDefault={submitSearch}>
            <span aria-hidden="true">⌕</span>
            <Input
              value={state.query}
              on:input={handleQueryInput}
              placeholder="Search another item…"
              autocomplete="off"
              spellcheck="false"
            />
          </form>

          <button type="button" class="inspection-open-profile" on:click={() => openBeaconProfile(state.selected)}>
            Open complete profile
          </button>
        </header>

        <section class="inspection-stage">
          <HomeFocus item={state.selected} onOpen={openBeaconProfile} />
        </section>

        <nav class="inspection-filmstrip" aria-label="Matching items">
          {#each state.results.slice(0, 10) as item}
            <button
              type="button"
              class:active={state.selected?.source_xml === item.source_xml}
              on:click={() => selectBeaconItem(item)}
            >
              <SmallverseIcon {item} />
              <span>
                <b>{item.name}</b>
                <small>{fmtNumber(item.uid_count || 0)} copies</small>
              </span>
            </button>
          {/each}
        </nav>
      </section>
    {:else}
      <section class="discovery-shell">
        <form class="command-search discovery-search" on:submit|preventDefault={submitSearch}>
          <span class="command-search-glyph" aria-hidden="true">⌕</span>
          <Input
            class="command-search-input"
            value={state.query}
            on:input={handleQueryInput}
            placeholder="Search items, tags, XML, or UID…"
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
          <span class="command-search-shortcut">⌘ K</span>
          <Button class="command-search-button" variant="ghost" disabled={state.loading}>
            {state.loading ? 'Searching' : 'Search'}
          </Button>
        </form>

        <section class="discovery-results">
          {#if state.error}
            <section class="command-empty">
              <b>{state.error}</b>
              <span>Beacon did not invent replacement results.</span>
            </section>
          {:else if state.loading && state.results.length === 0}
            <section class="command-empty">
              <b>Searching Observatory…</b>
              <span>Reading the current Smallverse snapshot.</span>
            </section>
          {:else if state.results.length === 0}
            <section class="command-empty">
              <b>No results{state.query ? ` for “${state.query}”` : ''}.</b>
              <span>
                {#if state.status?.generated_at}
                  Last sync: {fmtDate(state.status.generated_at)}.
                {/if}
                Missing items stay missing.
              </span>
            </section>
          {:else}
            <HomeResultIndex
              items={state.results}
              selected={state.selected}
              query={state.query}
              onSelect={selectBeaconItem}
              onInspect={inspectItem}
              onOpen={openBeaconProfile}
            />
          {/if}
        </section>
      </section>
    {/if}
  </section>

  <BeaconProfileDialog
    bind:open={$beaconState.profileDialogOpen}
    item={state.profileDialogItem}
  />
</section>
