<script>
  import AtlasItemCard from './AtlasItemCard.svelte';
  import { fmtNumber } from '$lib/beacon/format.js';

  export let group = null;
  export let selected = null;
  export let onSelect = () => {};
  export let onOpen = () => {};
</script>

{#if group?.items?.length}
  <section class="atlas-shelf">
    <header class="atlas-shelf-head">
      <div>
        <h2>{group.label}</h2>
        <p>{group.description}</p>
      </div>

      <span>{fmtNumber(group.items.length)} shown</span>
    </header>

    <div class="atlas-shelf-row">
      {#each group.items as item}
        <AtlasItemCard
          {item}
          selected={selected?.source_xml === item.source_xml}
          {onSelect}
          {onOpen}
        />
      {/each}
    </div>
  </section>
{/if}
