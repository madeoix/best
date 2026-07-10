<script>
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';
  import { getItemProfile } from '$lib/beacon/api.js';

  export let item = null;
  export let sourceXml = '';

  let profile = null;
  let loading = false;
  let error = '';
  let requestId = 0;

  $: resolvedSourceXml = sourceXml || item?.source_xml || item?.xml || item?.source || '';

  function fmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : String(value);
  }

  function niceDate(value) {
    if (!value) return '—';
    return String(value).replace('T', ' ').replace(/\.\d+$/, '');
  }

  function shortId(value) {
    if (!value) return '';
    const s = String(value);
    return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
  }

  function itemKind(value) {
    const category = value?.rarity_label || value?.category || '';
    const tags = String(value?.tags || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const wearable = tags.includes('wear') || tags.includes('clothing') || tags.includes('action_wearable_toggle');

    if (category && wearable) return `${category} wearable`;
    if (category) return category;
    if (wearable) return 'wearable';
    return 'Smallverse item';
  }

  async function loadProfile() {
    const current = ++requestId;

    profile = null;
    error = '';

    if (!resolvedSourceXml) return;

    loading = true;

    try {
      const data = await getItemProfile(resolvedSourceXml);
      if (current !== requestId) return;

      if (!data?.ok) {
        throw new Error(data?.error || 'Profile unavailable');
      }

      profile = data;
    } catch (err) {
      if (current !== requestId) return;
      error = err?.message || 'Failed to load item profile';
    } finally {
      if (current === requestId) loading = false;
    }
  }

  $: if (resolvedSourceXml) {
    loadProfile();
  }

  $: displayItem = profile?.item || item || { source_xml: resolvedSourceXml };
  $: stats = profile?.stats || {};
  $: owners = profile?.owners || [];
  $: spaces = profile?.spaces || [];
  $: latest = profile?.latest || [];
  $: topOwner = owners.find((owner) => owner.avatar_name) || owners[0];
  $: topSpace = spaces.find((space) => space.space_name) || spaces[0];
</script>

<section class="item-profile provenance-profile">
  {#if !resolvedSourceXml}
    <div class="item-profile-empty">
      <p>Select an item</p>
      <span>Item provenance will appear here.</span>
    </div>
  {:else}
    {#if loading}
      <div class="provenance-loading">
        <div class="loading-mark"></div>
        <strong>Resolving provenance</strong>
        <span>Building the item profile from owners, spaces, and observations.</span>
      </div>
    {:else if error}
      <div class="item-profile-state error">{error}</div>
    {:else if profile}
      <header class="provenance-hero">
        <div class="object-stage">
          <SmallverseIcon item={displayItem} size="large" />
        </div>

        <div class="object-label">
          <p>{itemKind(displayItem)}</p>
          <h2>{displayItem?.name || 'Unknown item'}</h2>

          {#if displayItem?.description}
            <span>{displayItem.description}</span>
          {/if}
        </div>
      </header>

      <section class="presence-panel">
        <p class="presence-kicker">Presence</p>

        <h3>
          {#if topSpace?.space_name && topOwner?.avatar_name}
            Recently observed in {topSpace.space_name}, associated with {topOwner.avatar_name}.
          {:else if topSpace?.space_name}
            Recently observed in {topSpace.space_name}.
          {:else if topOwner?.avatar_name}
            Associated with {topOwner.avatar_name}.
          {:else}
            Known through the Observatory record.
          {/if}
        </h3>

        <span>
          Last observed {niceDate(stats.latest_seen)}.
        </span>
      </section>

      <section class="provenance-section">
        <div class="provenance-head">
          <h3>Associated avatars</h3>
          <span>{fmt(stats.observed_owners)} in record</span>
        </div>

        <div class="avatar-pills">
          {#each owners.slice(0, 4) as owner}
            <article>
              <b>{owner.avatar_name ? owner.avatar_name.slice(0, 1) : '?'}</b>
              <div>
                <strong>{owner.avatar_name || 'Unknown avatar'}</strong>
                <span>
                  {#if owner.latest_space_name}
                    {owner.latest_space_name}
                  {:else}
                    {shortId(owner.owner_id)}
                  {/if}
                </span>
              </div>
            </article>
          {/each}
        </div>
      </section>

      <section class="provenance-section">
        <div class="provenance-head">
          <h3>Known spaces</h3>
          <span>{fmt(stats.known_spaces)} spaces</span>
        </div>

        <div class="space-stack">
          {#each spaces.slice(0, 3) as space}
            <article>
              <div>
                <strong>{space.space_name || 'Unknown space'}</strong>
                <span>
                  {#if space.latest_owner_name}
                    linked to {space.latest_owner_name}
                  {:else}
                    {shortId(space.space_id)}
                  {/if}
                </span>
              </div>
              <em>{niceDate(space.latest_seen)}</em>
            </article>
          {/each}
        </div>
      </section>

      <section class="record-strip">
        <div>
          <span>Copies</span>
          <strong>{fmt(stats.known_copies)}</strong>
        </div>
        <div>
          <span>Owners</span>
          <strong>{fmt(stats.observed_owners)}</strong>
        </div>
        <div>
          <span>Spaces</span>
          <strong>{fmt(stats.known_spaces)}</strong>
        </div>
      </section>

      <details class="technical-truth">
        <summary>Technical truth</summary>
        <dl>
          <div>
            <dt>Crawler observations</dt>
            <dd>{fmt(stats.crawler_observations)}</dd>
          </div>
          <div>
            <dt>Source XML</dt>
            <dd>{resolvedSourceXml}</dd>
          </div>
          <div>
            <dt>Identity</dt>
            <dd>{profile.technical?.owner_candidates_used ? 'owner candidates resolved' : 'unresolved'}</dd>
          </div>
          {#if latest[0]}
            <div>
              <dt>Latest UID</dt>
              <dd>{latest[0].uid || '—'}</dd>
            </div>
          {/if}
        </dl>
      </details>
    {/if}
  {/if}
</section>
