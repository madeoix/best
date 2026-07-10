<script>
  import { fmtNumber } from '$lib/beacon/format.js';
  import { makeItemGroups } from '$lib/beacon/itemGroups.js';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';

  export let items = [];
  export let selected = null;
  export let query = '';
  export let onSelect = () => {};
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

  function meta(item) {
    const copies = item?.uid_count ? `${fmtNumber(item.uid_count)} copies` : '';
    const owners = item?.owner_count ? `${fmtNumber(item.owner_count)} owners` : '';

    return [kind(item), copies, owners].filter(Boolean).join(' · ');
  }
</script>

<section class="command-list" aria-label="Beacon search results">
  <header>
    <span>{showGroups ? 'Catalog' : 'Results'}</span>
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
                on:click={() => onSelect(item)}
                on:dblclick={() => onOpen(item)}
              >
                <SmallverseIcon {item} />

                <span class="command-row-copy">
                  <b>{item.name}</b>
                  <small>{meta(item)}</small>
                </span>

                <span class="command-row-action">
                  Open
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="command-list-rows">
      {#each items as item}
        <button
          class:selected={selected?.source_xml === item.source_xml}
          on:mouseenter={() => onSelect(item)}
          on:focus={() => onSelect(item)}
          on:click={() => onSelect(item)}
          on:dblclick={() => onOpen(item)}
        >
          <SmallverseIcon {item} />

          <span class="command-row-copy">
            <b>{item.name}</b>
            <small>{meta(item)}</small>
          </span>

          <span class="command-row-action">
            Open
          </span>
        </button>
      {/each}
    </div>
  {/if}
</section>
