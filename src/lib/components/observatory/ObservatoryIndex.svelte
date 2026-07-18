<script>
  import { fmtDate, fmtNumber, shortXml } from '$lib/beacon/format.js';

  export let items = [];
  export let onOpen = () => {};

  const tones = ['mint', 'violet', 'amber', 'ice', 'rose'];

  function initials(name = '') {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'SV';
  }
</script>

<section class="discovery-field" aria-label="Observatory item index">
  <header class="discovery-head">
    <div><i></i><span>Live result field</span></div>
    <span>{fmtNumber(items.length)} verified objects</span>
  </header>

  <div class="object-grid">
    {#each items as item, index}
      <button
        class="object-tile tone-{tones[index % tones.length]}"
        class:object-featured={index === 0}
        on:click={() => onOpen(item)}
        style={`--delay:${Math.min(index, 10) * 35}ms`}
      >
        <span class="tile-atmosphere"></span>
        <span class="tile-scan"></span>

        <span class="tile-topline">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span>{item.category || 'object'}</span>
        </span>

        <span class="object-visual" aria-hidden="true">
          <span class="object-orbit"></span>
          <b>{initials(item.name)}</b>
        </span>

        <span class="object-copy">
          <span class="object-name">{item.name}</span>
          <span class="object-tags">{item.tags || shortXml(item.source_xml)}</span>
        </span>

        <span class="object-signal">
          <span><b>{fmtNumber(item.observed_count)}</b><small>sightings</small></span>
          <span><b>{fmtNumber(item.uid_count)}</b><small>UIDs</small></span>
          <span><b>{fmtNumber(item.owner_count)}</b><small>owners</small></span>
        </span>

        <span class="tile-footer">
          <span>Seen {fmtDate(item.latest_seen)}</span>
          <b>Inspect <i>↗</i></b>
        </span>
      </button>
    {/each}
  </div>
</section>
