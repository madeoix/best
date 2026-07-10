<script>
  import { onMount } from 'svelte';
  import { fmtNumber } from '$lib/beacon/format.js';
  import { makeItemGroups } from '$lib/beacon/itemGroups.js';
  import {
    atlasState,
    ensureAtlasLoaded,
    loadAtlas,
    loadAtlasPreset,
    openAtlasProfile,
    selectAtlasItem,
    setAtlasQuery
  } from '$lib/beacon/atlasState.js';

  import AtlasShelf from './AtlasShelf.svelte';
  import AtlasItemCard from './AtlasItemCard.svelte';
  import BeaconProfileDialog from '$lib/components/home/BeaconProfileDialog.svelte';

  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  const chips = [
    ['showcase', 'Showcase'],
    ['wearables', 'Wearables'],
    ['headwear', 'Heads'],
    ['creatures', 'Creatures'],
    ['furniture', 'Furniture'],
    ['props', 'Props'],
    ['rare', 'Rare']
  ];

  onMount(() => {
    ensureAtlasLoaded();
  });

  $: state = $atlasState;
  $: groups = makeItemGroups(state.items, { dedupeAcrossGroups: true, limit: 10 });
  $: searched = String(state.query || '').trim().length > 0;
</script>

<section class="atlas-items-view">
  <section class="atlas-toolbar">
    <form on:submit|preventDefault={() => loadAtlas(state.query, { preset: 'search', force: true, limit: 100 })}>
      <Input
        class="atlas-search"
        value={state.query}
        on:input={(event) => setAtlasQuery(event.currentTarget.value)}
        placeholder="Search Atlas items…"
        autocomplete="off"
        spellcheck="false"
      />

      <Button variant="ghost" disabled={state.loading}>
        {state.loading ? 'Loading' : 'Search'}
      </Button>
    </form>

    <div class="atlas-chips">
      {#each chips as chip}
        <button
          type="button"
          class:active={state.preset === chip[0] && !searched}
          on:click={() => loadAtlasPreset(chip[0])}
        >
          {chip[1]}
        </button>
      {/each}
    </div>
  </section>

  {#if state.error}
    <section class="atlas-empty">
      <b>{state.error}</b>
      <span>Beacon did not invent replacement catalog data.</span>
    </section>
  {:else if state.loading && !state.loaded}
    <section class="atlas-empty">
      <b>Building item Atlas…</b>
      <span>Reading the current Observatory item snapshot.</span>
    </section>
  {:else if state.items.length === 0}
    <section class="atlas-empty">
      <b>No Atlas items{state.query ? ` for “${state.query}”` : ''}.</b>
      <span>Missing items stay missing until the source snapshot sees them.</span>
    </section>
  {:else if searched}
    <section class="atlas-search-grid">
      <header>
        <div>
          <h2>Search results</h2>
          <p>{fmtNumber(state.items.length)} matching item records.</p>
        </div>
      </header>

      <div class="atlas-grid">
        {#each state.items as item}
          <AtlasItemCard
            {item}
            selected={state.selected?.source_xml === item.source_xml}
            onSelect={selectAtlasItem}
            onOpen={openAtlasProfile}
          />
        {/each}
      </div>
    </section>
  {:else}
    <section class="atlas-showcase">
      <div class="atlas-showcase-title">
        <p>OBJECT BROWSER</p>
        <h2>Item browser</h2>
        <span>Item shelves from the current item/Observatory contracts. Space context lives in Spaces.</span>
      </div>

      {#each groups as group}
        <AtlasShelf
          {group}
          selected={state.selected}
          onSelect={selectAtlasItem}
          onOpen={openAtlasProfile}
        />
      {/each}
    </section>
  {/if}

  <BeaconProfileDialog bind:open={$atlasState.profileOpen} item={state.profileItem} />
</section>
