<script>
  import { onMount } from 'svelte';
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';

  import {
    beaconState,
    closeBeaconProfile,
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

  onMount(() => {
    ensureBeaconHomeLoaded();
  });

  $: state = $beaconState;
  $: counts = state.status?.counts || {};
</script>

<section class="module home-module command-home">
  <section class="command-shell">
    <header class="command-topline">
      <div>
        <p>BEACON</p>
        <h1>Search Smallverse</h1>
      </div>

      <div class="command-truthline">
        {#if state.status?.ok}
          <span>{fmtNumber(counts.assets)} assets</span>
          <span>{fmtNumber(counts.observations)} observations</span>
          <span>synced {fmtDate(state.status.generated_at)}</span>
        {:else if state.statusLoading}
          <span>Checking Observatory…</span>
        {:else}
          <span>Observatory unavailable</span>
        {/if}
      </div>
    </header>

    <section class="command-panel">
      <form class="command-search" on:submit|preventDefault={() => runBeaconSearch(state.query)}>
        <Input
          class="command-search-input"
          value={state.query}
          on:input={(event) => setBeaconQuery(event.currentTarget.value)}
          placeholder="Search items, tags, XML…"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />

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
          {:else if state.loading}
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
              onSelect={selectBeaconItem}
              onOpen={openBeaconProfile}
            />
          {/if}
        </main>

        <HomeFocus
          item={state.selected}
          status={state.status}
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
