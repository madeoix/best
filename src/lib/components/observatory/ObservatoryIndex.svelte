<script>
  import { fmtDate, fmtNumber, shortXml } from '$lib/beacon/format.js';

  export let items = [];
  export let onOpen = () => {};
</script>

<section class="atlas-index" aria-label="Observatory item index">
  <header class="index-head">
    <span>Index</span>
    <span>{fmtNumber(items.length)} records</span>
  </header>

  {#each items as item, index}
    <button class="atlas-row" on:click={() => onOpen(item)}>
      <span class="ordinal">{String(index + 1).padStart(2, '0')}</span>

      <span class="atlas-object">
        <b>{item.name}</b>

        <span class="atlas-meta">
          {item.category || 'uncategorized'}
          {item.tags ? ` · ${item.tags}` : ''}
        </span>

        <code>{shortXml(item.source_xml)}</code>
      </span>

      <span class="atlas-measure primary">
        <b>{fmtNumber(item.observed_count)}</b>
        <small>sightings</small>
      </span>

      <span class="atlas-measure">
        <b>{fmtNumber(item.uid_count)}</b>
        <small>UIDs</small>
      </span>

      <span class="atlas-measure">
        <b>{fmtNumber(item.owner_count)}</b>
        <small>owners</small>
      </span>

      <span class="atlas-seen">
        <small>latest</small>
        <b>{fmtDate(item.latest_seen)}</b>
      </span>
    </button>
  {/each}
</section>
