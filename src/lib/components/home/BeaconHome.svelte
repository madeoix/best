<script>
  import { onDestroy, onMount } from 'svelte';
  import '$lib/styles/beacon.css';

  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';

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

  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let searchTimer;

  function handleQueryInput(event) {
    const query = event.currentTarget.value;
    setBeaconQuery(query);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runBeaconSearch(query), 180);
  }

  onMount(() => {
    ensureBeaconHomeLoaded();
  });

  onDestroy(() => {
    clearTimeout(searchTimer);
  });

  $: state = $beaconState;
  $: counts = state.status?.counts || {};
</script>

<section class="module home-module command-home">
  <section class="command-shell">
    <header class="command-topline">
      <div>
        <p>OBSERVATORY</p>
        <h1>Search Smallverse</h1>
        <span>Find an item visually, then inspect the preserved evidence behind it.</span>
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

    <section class="command-panel">
      <form class="command-search" on:submit|preventDefault={() => runBeaconSearch(state.query)}>
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

      <section class="command-body">
        <main class="command-list-pane">
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
              onOpen={openBeaconProfile}
            />
          {/if}
        </main>

        <HomeFocus
          item={state.selected}
          onOpen={openBeaconProfile}
        />
      </section>
    </section>
  </section>

  <BeaconProfileDialog
    bind:open={$beaconState.profileDialogOpen}
    item={state.profileDialogItem}
  />
</section>
