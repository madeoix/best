<script>
  import { publicApiUrl } from '$lib/runtime/apiClient.js';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';
  import { getItemProfile } from '$lib/beacon/api.js';
  import { fmtDate, fmtNumber, shortXml } from '$lib/beacon/format.js';

  export let item = null;
  export let onOpen = () => {};

  let profile = null;
  let requestId = 0;

  $: sourceXml = item?.source_xml || '';

  async function hydrateProfile() {
    const current = ++requestId;
    profile = null;

    if (!sourceXml) return;

    try {
      const data = await getItemProfile(sourceXml);
      if (current !== requestId) return;
      if (data?.ok) profile = data;
    } catch {
      // Search result data remains visible when profile enrichment is unavailable.
    }
  }

  $: if (sourceXml) hydrateProfile();

  $: displayItem = profile?.item || item;
  $: stats = profile?.stats || {};
  $: owners = profile?.owners || [];
  $: spaces = profile?.spaces || [];
  $: copyCount = stats.known_copies ?? item?.uid_count;
  $: ownerCount = stats.observed_owners ?? item?.owner_count;
  $: observationCount = stats.crawler_observations ?? item?.observed_count;
  $: latestSeen = stats.latest_seen ?? item?.latest_seen;

  function kind(value) {
    const category = value?.category || 'item';
    const tags = String(value?.tags || '');
    return tags.includes('wear') || tags.includes('clothing')
      ? `${category} wearable`
      : category;
  }

  function ownerName(owner) {
    return owner?.display_avatar_name || owner?.primary_avatar_name || owner?.avatar_name || 'Unknown avatar';
  }

  function verifiedPortrait(owner) {
    return owner?.avatar_portrait_thumb_url ||
      owner?.avatar_portrait_url ||
      owner?.avatar_portrait_snapshot_url ||
      '';
  }

  function portrait(owner) {
    const verified = verifiedPortrait(owner);
    if (verified) return verified;

    const label = encodeURIComponent(ownerName(owner).slice(0, 2).toUpperCase());
    const status = encodeURIComponent(owner?.avatar_portrait_status || 'missing');
    return publicApiUrl(`/api/beacon/avatar/badge?label=${label}&status=${status}`);
  }

  function portraitRank(owner) {
    if (owner?.avatar_portrait_source === 'identity.avatar_assets_live' && verifiedPortrait(owner)) return 3;
    if (owner?.avatar_portrait_status === 'verified' && verifiedPortrait(owner)) return 2;
    return verifiedPortrait(owner) ? 1 : 0;
  }

  function displayOwners(list = [], limit = 3) {
    return [...list]
      .sort((a, b) => portraitRank(b) - portraitRank(a) || Number(b?.confidence || 0) - Number(a?.confidence || 0))
      .slice(0, limit);
  }
</script>

<aside class="command-preview evidence-preview">
  {#if !item}
    <div class="command-preview-empty">
      <strong>Select an item</strong>
      <span>Its rendered visual and preserved evidence will appear here.</span>
    </div>
  {:else}
    <header class="preview-label">
      <span>Selected item</span>
      {#if latestSeen}<small>seen {fmtDate(latestSeen)}</small>{/if}
    </header>

    <section class="command-preview-object">
      <div class="command-preview-icon">
        <SmallverseIcon item={displayItem} size="large" />
      </div>

      <div class="preview-object-copy">
        <p>{kind(displayItem)}</p>
        <h2>{displayItem?.name || 'Unknown item'}</h2>
        <code>{shortXml(sourceXml)}</code>
        {#if displayItem?.description}
          <span>{displayItem.description}</span>
        {/if}
      </div>
    </section>

    <section class="preview-metrics" aria-label="Item metrics">
      <div>
        <strong>{fmtNumber(copyCount || 0)}</strong>
        <span>known copies</span>
      </div>
      <div>
        <strong>{fmtNumber(ownerCount || 0)}</strong>
        <span>observed owners</span>
      </div>
      <div>
        <strong>{fmtNumber(observationCount || 0)}</strong>
        <span>observations</span>
      </div>
    </section>

    <section class="preview-evidence">
      <header>
        <span>Recent evidence</span>
        <em>{profile ? 'profile hydrated' : 'loading profile'}</em>
      </header>

      <div class="preview-evidence-rows">
        {#each spaces.slice(0, 2) as space}
          <article>
            <span class="evidence-type">Placed in space</span>
            <b>{space.space_name || space.space_id || 'Unknown space'}</b>
            <small>{space.latest_seen ? fmtDate(space.latest_seen) : 'preserved observation'}</small>
          </article>
        {/each}

        {#each displayOwners(owners, 3) as owner}
          <article class="evidence-owner">
            <img src={portrait(owner)} alt={ownerName(owner)} loading="lazy" decoding="async" />
            <span>
              <b>{ownerName(owner)}</b>
              <small>associated avatar</small>
            </span>
          </article>
        {/each}

        {#if spaces.length === 0 && owners.length === 0}
          <p>Evidence context appears as the item profile finishes loading.</p>
        {/if}
      </div>
    </section>

    <footer class="command-preview-footer">
      <span>Source-backed item profile</span>
      <button type="button" on:click={() => onOpen(item)}>
        Open full profile
      </button>
    </footer>
  {/if}
</aside>
