<script>
  import { fmtNumber } from '$lib/beacon/format.js';

  export let space = null;
  export let selected = false;
  export let onSelect = () => {};
  export let onOpen = () => {};

  $: title = space?.display_name || space?.space_name || space?.description || 'Unknown space';
  $: image = space?.snapshot_url || space?.thumb_url || '';
  $: kind = space?.kind || space?.curation?.kind || 'space';
  $: reasons = space?.reasons || space?.curation?.reasons || [];
  $: itemSignals = Number(space?.item_count || 0);
  $: ownerSignals = Number(space?.owner_count || 0);
  $: observationSignals = Number(space?.observation_count || 0);
</script>

<button
  type="button"
  class:selected
  class="atlas-space-card"
  on:mouseenter={() => onSelect(space)}
  on:focus={() => onSelect(space)}
  on:click={() => {
    onSelect(space);
    onOpen(space);
  }}
>
  <div class="atlas-space-image">
    {#if image}
      <img src={image} alt={title} loading="lazy" decoding="async" />
    {:else}
      <span>No preview</span>
    {/if}

    <b>{kind}</b>
  </div>

  <div class="atlas-space-copy">
    <p>{reasons?.[0] || 'backend space contract'}</p>
    <h3>{title}</h3>

    <span>
      {fmtNumber(itemSignals)} item signals
      {#if ownerSignals}
        · {fmtNumber(ownerSignals)} owners
      {:else if observationSignals}
        · {fmtNumber(observationSignals)} evidence rows
      {/if}
    </span>
  </div>

  <footer>
    <span>{space?.source_layers?.join(' · ') || 'beacon-world-index'}</span>
    <em>Open</em>
  </footer>
</button>
