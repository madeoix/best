<script>
  import { onMount } from 'svelte';
  import { createObservatoryStore } from '$lib/beacon/observatoryStore.js';
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';

  import ObservatoryCommand from './ObservatoryCommand.svelte';
  import ObservatoryIndex from './ObservatoryIndex.svelte';
  import ObservatoryRecord from './ObservatoryRecord.svelte';
  import ObservatorySnapshot from './ObservatorySnapshot.svelte';

  const observatory = createObservatoryStore();

  const {
    status,
    query,
    results,
    loading,
    error,
    selected,
    itemLoading
  } = observatory;

  onMount(observatory.init);

  $: counts = $status?.counts || {};
</script>

<section class="module observatory-module">
  {#if $selected}
    <ObservatoryRecord
      record={$selected}
      loading={$itemLoading}
      onBack={observatory.closeItem}
    />
  {:else}
    <section class="atlas-workspace">
      <header class="atlas-chapter">
        <div>
          <p>OBSERVATORY</p>
          <h1>Item atlas</h1>
        </div>

        <div class="chapter-copy">
          <span>Search every real sighting Beacon has captured.</span>

          {#if $status?.ok}
            <small>
              {fmtNumber(counts.assets)} assets ·
              {fmtNumber(counts.observations)} observations ·
              synced {fmtDate($status.generated_at)}
            </small>
          {:else}
            <small>Observatory status unavailable</small>
          {/if}
        </div>
      </header>

      <ObservatoryCommand
        query={$query}
        loading={$loading}
        onQuery={(value) => query.set(value)}
        onSearch={observatory.runSearch}
      />

      <section class="atlas-body">
        <main class="atlas-primary">
          {#if $error}
            <section class="atlas-empty">
              <b>{$error}</b>
              <span>Beacon did not invent replacement data.</span>
            </section>
          {:else if $loading}
            <section class="atlas-empty">
              <b>Searching Observatory truth…</b>
              <span>Reading the real sync snapshot.</span>
            </section>
          {:else if $results.length === 0}
            <section class="atlas-empty">
              <b>No sightings found{$query ? ` for “${$query}”` : ''}.</b>
              <span>
                {#if $status?.generated_at}
                  Observatory last synced {fmtDate($status.generated_at)}.
                {/if}
                Missing items stay missing.
              </span>
            </section>
          {:else}
            <ObservatoryIndex
              items={$results}
              onOpen={observatory.openItem}
            />
          {/if}
        </main>

        <ObservatorySnapshot
          status={$status}
          results={$results}
          query={$query}
        />
      </section>
    </section>
  {/if}
</section>
