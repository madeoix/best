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
  $: featuredName = featuredSpace?.name || 'Explore Smallverse';
  $: resultTitle = state.query ? `Results for “${state.query}”` : 'Recent rare discoveries';
</script>

<svelte:window on:keydown={(event) => {
  if (event.key === 'Escape' && inspectionOpen) returnToResults();
}} />

<section class:inspection-mode={inspectionOpen}>
  {#if inspectionOpen && state.selected}
    <section class="client-discovery">
      <div class="client-discovery-inner">
        <section class="inspection-shell">
          <header class="inspection-toolbar">
            <button type="button" class="inspection-back" on:click={returnToResults}>
              ← Back to results
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
      </div>
    </section>
  {:else}
    <section class="client-discovery">
      <div class="client-discovery-inner">
        <section class="client-hero-grid">
          <article class="client-world-stage">
            {#if worldImage}
              <img
                src={worldImage}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
              />
            {/if}

            <div class="client-world-copy">
              <p class="client-kicker">Preserved SmallWorlds</p>
              <h1>{featuredName}</h1>
              <span>
                Search the evidence-backed archive for rare items, decoded variants,
                named avatars, and resolved spaces.
              </span>

              <div class="client-hero-actions">
                <button class="primary" type="button" on:click={() => document.querySelector('.client-search input')?.focus()}>
                  Search the archive
                </button>
                <button type="button" on:click={() => runBeaconSearch('')}>
                  Browse recent finds
                </button>
              </div>
            </div>
          </article>

          <aside class="client-activity">
            <header>
              <span>Live archive</span>
              <h2>Preservation activity</h2>
            </header>

            <dl>
              <div>
                <dt>Published assets</dt>
                <dd>{fmtNumber(counts.assets || 0)}</dd>
              </div>
              <div>
                <dt>Observations</dt>
                <dd>{fmtNumber(counts.observations || 0)}</dd>
              </div>
              <div>
                <dt>Visible spaces</dt>
                <dd>{fmtNumber($worldStore.world?.counts?.visible_spaces || 0)}</dd>
              </div>
              <div>
                <dt>Last synchronized</dt>
                <dd>{state.status?.generated_at ? fmtDate(state.status.generated_at) : '—'}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <div class="client-search-wrap">
          <form class="client-search" on:submit|preventDefault={submitSearch}>
            <span aria-hidden="true">⌕</span>
            <Input
              value={state.query}
              on:input={handleQueryInput}
              placeholder="Search items, tags, XML, or UID…"
              autocomplete="off"
              spellcheck="false"
              autofocus
            />
            <Button variant="ghost" disabled={state.loading}>
              {state.loading ? 'Searching' : 'Search'}
            </Button>
          </form>
        </div>

        <section class="client-results">
          <header class="client-results-head">
            <div>
              <span>Observatory index</span>
              <h2>{resultTitle}</h2>
            </div>

            <p>
              {#if state.status?.ok}
                {fmtNumber(state.results.length)} published records · synced {fmtDate(state.status.generated_at)}
              {:else if state.statusLoading}
                Checking Observatory…
              {:else}
                Observatory unavailable
              {/if}
            </p>
          </header>

          {#if state.error}
            <section class="client-empty">
              <b>{state.error}</b>
              <span>Beacon did not invent replacement results.</span>
            </section>
          {:else if state.loading && state.results.length === 0}
            <section class="client-empty">
              <b>Searching Observatory…</b>
              <span>Reading the current Smallverse snapshot.</span>
            </section>
          {:else if state.results.length === 0}
            <section class="client-empty">
              <b>No published matches yet.</b>
              <span>
                {#if state.status?.generated_at}
                  Last sync: {fmtDate(state.status.generated_at)}.
                {/if}
                Missing records stay missing.
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
      </div>
    </section>
  {/if}

  <BeaconProfileDialog
    bind:open={$beaconState.profileDialogOpen}
    item={state.profileDialogItem}
  />
</section>