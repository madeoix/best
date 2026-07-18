<script>
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';
  import { makeItemGroups } from '$lib/beacon/itemGroups.js';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';

  export let items = [];
  export let selected = null;
  export let query = '';
  export let onSelect = () => {};
  export let onInspect = () => {};
  export let onOpen = () => {};

  $: grouped = makeItemGroups(items);
  $: showGroups = !String(query || '').trim() && grouped.length > 1;

  function kind(item) {
    const category = item?.category || 'item';
    const tags = String(item?.tags || '');

    if (tags.includes('wear') || tags.includes('clothing')) {
      return `${category} wearable`;
    }

    return category;
  }

  function variant(item) {
    return item?.variant_name || item?.color_name || item?.variant || '';
  }

  function observedPrice(item) {
    const low =
      item?.observed_price_low ??
      item?.price_low ??
      item?.min_price ??
      item?.ask_low;
    const high =
      item?.observed_price_high ??
      item?.price_high ??
      item?.max_price ??
      item?.ask_high;

    if (low == null && high == null) return '';

    if (low != null && high != null && Number(low) !== Number(high)) {
      return `${fmtNumber(low)}–${fmtNumber(high)}`;
    }

    return fmtNumber(low ?? high);
  }

  function latest(item) {
    return item?.latest_seen ? fmtDate(item.latest_seen) : '';
  }

  function meta(item) {
    return [variant(item), kind(item)].filter(Boolean).join(' · ');
  }
</script>

<section class="command-list visual-search-results" aria-label="Beacon search results">
  <header>
    <span>{showGroups ? 'Catalog' : 'Visual results'}</span>
    <span>{fmtNumber(items.length)} records</span>
  </header>

  {#if showGroups}
    <div class="catalog-groups">
      {#each grouped as group}
        <section class="catalog-group">
          <div class="catalog-group-head">
            <div>
              <h3>{group.label}</h3>
              <p>{group.description}</p>
            </div>
            <span>{fmtNumber(group.items.length)}</span>
          </div>

          <div class="command-list-rows grouped">
            {#each group.items as item}
              <button
                class:selected={selected?.source_xml === item.source_xml}
                on:mouseenter={() => onSelect(item)}
                on:focus={() => onSelect(item)}
                on:click={() => onInspect(item)}
                on:dblclick={() => onOpen(item)}
              >
                <span class="command-row-visual"><SmallverseIcon {item} /></span>
                <span class="command-row-copy">
                  <b>{item.name}</b>
                  <small>{meta(item)}</small>
                </span>
                <span class="command-row-count">
                  <b>{fmtNumber(item.uid_count || 0)}</b>
                  <small>copies</small>
                </span>
                <span class="command-row-seen">
                  <b>{latest(item) || '—'}</b>
                  <small>latest seen</small>
                </span>
                <span class="command-row-action">›</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="command-list-rows visual">
      {#each items as item}
        {@const price = observedPrice(item)}
        <button
          class:selected={selected?.source_xml === item.source_xml}
          on:mouseenter={() => onSelect(item)}
          on:focus={() => onSelect(item)}
          on:click={() => onInspect(item)}
          on:dblclick={() => onOpen(item)}
        >
          <span class="command-row-visual"><SmallverseIcon {item} /></span>

          <span class="command-row-copy">
            <b>{item.name}</b>
            <small>{meta(item)}</small>
          </span>

          <span class="command-row-price" class:missing={!price}>
            <i aria-hidden="true">◉</i>
            <b>{price || '—'}</b>
            <small>{price ? 'observed ask' : 'no ask indexed'}</small>
          </span>

          <span class="command-row-count">
            <b>{fmtNumber(item.uid_count || 0)}</b>
            <small>copies</small>
          </span>

          <span class="command-row-seen">
            <b>{latest(item) || '—'}</b>
            <small>latest seen</small>
          </span>

          <span class="command-row-action">›</span>
        </button>
      {/each}
    </div>

    <footer class="command-results-hint">
      <span>Hover to preview</span>
      <span>Click an item to enter inspection mode</span>
    </footer>
  {/if}
</section>
