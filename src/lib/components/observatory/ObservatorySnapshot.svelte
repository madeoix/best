<script>
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';

  export let status = null;
  export let results = [];
  export let query = '';

  $: counts = status?.counts || {};
  $: topItem = results?.[0] || null;
</script>

<aside class="atlas-snapshot">
  <section>
    <p>DATASET</p>

    {#if status?.ok}
      <dl>
        <div>
          <dt>Assets</dt>
          <dd>{fmtNumber(counts.assets)}</dd>
        </div>

        <div>
          <dt>Observations</dt>
          <dd>{fmtNumber(counts.observations)}</dd>
        </div>

        <div>
          <dt>UID events</dt>
          <dd>{fmtNumber(counts.uid_change_events)}</dd>
        </div>

        <div>
          <dt>Variant visuals</dt>
          <dd>{fmtNumber(counts.variant_visuals)}</dd>
        </div>

        <div>
          <dt>Snapshot</dt>
          <dd>{fmtDate(status.generated_at)}</dd>
        </div>
      </dl>
    {:else}
      <span class="muted">Observatory status unavailable.</span>
    {/if}
  </section>

  <section>
    <p>{query ? 'TOP MATCH' : 'MOST OBSERVED'}</p>

    {#if topItem}
      <div class="snapshot-feature">
        <b>{topItem.name}</b>
        <span>{topItem.category || 'uncategorized'}{topItem.tags ? ` · ${topItem.tags}` : ''}</span>

        <div>
          <strong>{fmtNumber(topItem.observed_count)}</strong>
          <small>sightings</small>
        </div>
      </div>
    {:else}
      <span class="muted">No item selected by the current result set.</span>
    {/if}
  </section>

  <section>
    <p>RULE</p>
    <span class="snapshot-note">Beacon only shows what the source snapshot actually contains.</span>
  </section>
</aside>
