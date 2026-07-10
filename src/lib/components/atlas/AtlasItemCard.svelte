<script>
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';
  import { fmtNumber } from '$lib/beacon/format.js';

  export let item = null;
  export let selected = false;
  export let onSelect = () => {};
  export let onOpen = () => {};

  function kind(value) {
    const category = value?.category || 'item';
    const tags = String(value?.tags || '');

    if (tags.includes('wear') || tags.includes('clothing')) {
      return `${category} wearable`;
    }

    return category;
  }
</script>

<button
  type="button"
  class:selected
  class="atlas-card"
  on:mouseenter={() => onSelect(item)}
  on:focus={() => onSelect(item)}
  on:click={() => onSelect(item)}
  on:dblclick={() => onOpen(item)}
>
  <div class="atlas-card-art">
    <SmallverseIcon {item} size="large" />
  </div>

  <div class="atlas-card-copy">
    <p>{kind(item)}</p>
    <h3>{item?.name || 'Unknown item'}</h3>

    <span>
      {fmtNumber(item?.uid_count || 0)} copies
      {#if item?.owner_count}
        · {fmtNumber(item.owner_count)} owners
      {/if}
    </span>
  </div>

  <footer>
    {#if item?.latest_seen}
      <span>observed</span>
    {:else}
      <span>record</span>
    {/if}

    <em>Open</em>
  </footer>
</button>
