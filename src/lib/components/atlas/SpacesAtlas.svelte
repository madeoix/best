<script>
  import { onMount } from 'svelte';
  import { fmtNumber } from '$lib/beacon/format.js';
  import {
    worldStore,
    loadWorld,
    selectSpace,
    openSpaceProfile,
    closeSpaceProfile
  } from '$lib/beacon/stores/worldStore.js';

  import AtlasSpaceCard from './AtlasSpaceCard.svelte';
  import SpaceProfileDialog from './SpaceProfileDialog.svelte';

  onMount(() => {
    loadWorld();
  });

  $: world = $worldStore.world;
  $: worldLoading = $worldStore.loading;
  $: worldError = $worldStore.error;
  $: selectedSpace = $worldStore.selectedSpace;

  $: marketSpaces = world?.sections?.market || [];
  $: usefulSpaces = world?.sections?.useful || [];
  $: watchlistSpaces = world?.sections?.watchlist || [];
  $: filteredSpaces = world?.sections?.filtered || [];
</script>

<section class="atlas-spaces-view">
  <div class="atlas-showcase-title">
    <p>WORLD ATLAS</p>
    <h2>Spaces</h2>
    <span>Backend Beacon world contract: spaces, item signals, owners, evidence, and capture images.</span>
  </div>

  {#if worldError}
    <section class="atlas-empty">
      <b>{worldError}</b>
      <span>Beacon world contract is unavailable.</span>
    </section>
  {:else if worldLoading && !world}
    <section class="atlas-empty">
      <b>Loading world contract…</b>
      <span>Reading /opt/smallverse/workspace/beacon-world-index.json.</span>
    </section>
  {:else if !world}
    <section class="atlas-empty">
      <b>No world contract loaded.</b>
      <span>Run the backend Beacon world export first.</span>
    </section>
  {:else}
    <section class="atlas-world-summary">
      <article>
        <span>Visible spaces</span>
        <strong>{fmtNumber(world.counts?.visible_spaces || 0)}</strong>
      </article>
      <article>
        <span>Market spaces</span>
        <strong>{fmtNumber(world.counts?.market_spaces || 0)}</strong>
      </article>
      <article>
        <span>Useful spaces</span>
        <strong>{fmtNumber(world.counts?.useful_spaces || 0)}</strong>
      </article>
      <article>
        <span>Filtered</span>
        <strong>{fmtNumber(world.counts?.filtered_spaces || 0)}</strong>
      </article>
    </section>

    <section class="atlas-space-section">
      <header>
        <div>
          <h2>Market spaces</h2>
          <p>Sale, flea, shop, auction, and trading spaces with useful item/evidence signals.</p>
        </div>
        <span>{fmtNumber(marketSpaces.length)} spaces</span>
      </header>

      <div class="atlas-space-grid">
        {#each marketSpaces as space}
          <AtlasSpaceCard
            {space}
            selected={selectedSpace?.space_id === space.space_id}
            onSelect={selectSpace}
            onOpen={openSpaceProfile}
          />
        {/each}
      </div>
    </section>

    <section class="atlas-space-section">
      <header>
        <div>
          <h2>Useful private and item-rich spaces</h2>
          <p>Homes, collector spaces, and custom spaces kept because the backend found useful evidence.</p>
        </div>
        <span>{fmtNumber(usefulSpaces.length)} spaces</span>
      </header>

      <div class="atlas-space-grid">
        {#each usefulSpaces as space}
          <AtlasSpaceCard
            {space}
            selected={selectedSpace?.space_id === space.space_id}
            onSelect={selectSpace}
            onOpen={openSpaceProfile}
          />
        {/each}
      </div>
    </section>

    {#if watchlistSpaces.length}
      <section class="atlas-space-section low-signal">
        <header>
          <div>
            <h2>Watchlist</h2>
            <p>Low-confidence spaces kept visible because they may still contain useful evidence.</p>
          </div>
          <span>{fmtNumber(watchlistSpaces.length)} spaces</span>
        </header>

        <div class="atlas-space-grid compact">
          {#each watchlistSpaces as space}
            <AtlasSpaceCard
              {space}
              selected={selectedSpace?.space_id === space.space_id}
              onSelect={selectSpace}
              onOpen={openSpaceProfile}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if filteredSpaces.length}
      <details class="atlas-hidden-spaces">
        <summary>{fmtNumber(filteredSpaces.length)} filtered official / mission / empty spaces</summary>

        <div class="atlas-space-grid compact">
          {#each filteredSpaces.slice(0, 24) as space}
            <AtlasSpaceCard
              {space}
              selected={selectedSpace?.space_id === space.space_id}
              onSelect={selectSpace}
              onOpen={openSpaceProfile}
            />
          {/each}
        </div>
      </details>
    {/if}
  {/if}

  <SpaceProfileDialog
    open={$worldStore.profileOpen}
    loading={$worldStore.profileLoading}
    error={$worldStore.profileError}
    profile={$worldStore.profile}
    on:close={closeSpaceProfile}
  />
</section>
