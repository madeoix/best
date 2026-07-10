<script>
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';
  import { getItemProfile } from '$lib/beacon/api.js';
  import { fmtNumber } from '$lib/beacon/format.js';

  export let item = null;
  export let onOpen = () => {};

  let profile = null;
  let requestId = 0;

  $: sourceXml = item?.source_xml || '';

  function kind(value) {
    const category = value?.category || 'item';
    const tags = String(value?.tags || '');

    if (tags.includes('wear') || tags.includes('clothing')) {
      return `${category} wearable`;
    }

    return category;
  }

  async function hydrateProfile() {
    const current = ++requestId;
    profile = null;

    if (!sourceXml) return;

    try {
      const data = await getItemProfile(sourceXml);
      if (current !== requestId) return;

      if (data?.ok) profile = data;
    } catch {
      // Preview stays useful from search result data.
    }
  }

  $: if (sourceXml) {
    hydrateProfile();
  }

  $: displayItem = profile?.item || item;
  $: stats = profile?.stats || {};
  $: owners = profile?.owners || [];
  $: spaces = profile?.spaces || [];
  $: topOwner = owners.find((owner) => owner.avatar_name) || owners[0];
  $: topSpace = spaces.find((space) => space.space_name) || spaces[0];

  $: copyCount = stats.known_copies ?? item?.uid_count;
  $: ownerCount = stats.observed_owners ?? item?.owner_count;

  function avatarPortrait(owner) {
    return (
      owner?.avatar_portrait_thumb_url ||
      owner?.avatar_portrait_url ||
      owner?.avatar_portrait_snapshot_url ||
      ''
    );
  }

  function avatarInitial(owner) {
    const text = String(owner?.avatar_name || owner?.owner_id || '?').trim();
    if (!text) return '?';
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }


  function ownerName(owner) {
    return owner?.display_avatar_name || owner?.primary_avatar_name || owner?.avatar_name || 'Unknown avatar';
  }

  function verifiedOwnerPortrait(owner) {
    return (
      owner?.avatar_portrait_thumb_url ||
      owner?.avatar_portrait_url ||
      owner?.avatar_portrait_snapshot_url ||
      ''
    );
  }

  function ownerPortrait(owner) {
    const verified = verifiedOwnerPortrait(owner);

    if (verified) return verified;

    const label = encodeURIComponent(ownerName(owner).slice(0, 2).toUpperCase());
    const status = encodeURIComponent(owner?.avatar_portrait_status || 'missing');

    return `/api/beacon/avatar/badge?label=${label}&status=${status}`;
  }

  function ownerPortraitRank(owner) {
    if (owner?.avatar_portrait_source === 'identity.avatar_assets_live' && verifiedOwnerPortrait(owner)) return 3;
    if (owner?.avatar_portrait_status === 'verified' && verifiedOwnerPortrait(owner)) return 2;
    if (verifiedOwnerPortrait(owner)) return 1;
    return 0;
  }

  function sortedOwnersForDisplay(list = [], limit = 8) {
    return [...(list || [])]
      .sort((a, b) => {
        const portraitDelta = ownerPortraitRank(b) - ownerPortraitRank(a);
        if (portraitDelta) return portraitDelta;

        return Number(b?.confidence || 0) - Number(a?.confidence || 0);
      })
      .slice(0, limit);
  }

</script>

<aside class="command-preview">
  {#if !item}
    <div class="command-preview-empty">
      <strong>Select an item</strong>
      <span>Item context appears here.</span>
    </div>
  {:else}
    <section class="command-preview-object">
      <div class="command-preview-icon">
        <SmallverseIcon item={displayItem} size="large" />
      </div>

      <div>
        <p>{kind(displayItem)}</p>
        <h2>{displayItem?.name || 'Unknown item'}</h2>

        {#if displayItem?.description}
          <span>{displayItem.description}</span>
        {/if}
      </div>
    </section>

    <section class="command-preview-signal">
      <p>Signal</p>

      {#if topSpace?.space_name}
        <strong>{topSpace.space_name}</strong>
        <span>
          {#if topOwner?.avatar_name}
            associated with {topOwner.avatar_name}
          {:else}
            owner unresolved
          {/if}
        </span>
      {:else if topOwner?.avatar_name}
        <strong>{topOwner.avatar_name}</strong>
        <span>associated avatar</span>
      {:else}
        <strong>{fmtNumber(copyCount || 0)} known copies</strong>
        <span>{fmtNumber(ownerCount || 0)} observed owners</span>
      {/if}
    </section>

    <section class="command-preview-people">
      <header>
        <span>Associated avatars</span>
        {#if ownerCount}
          <em>{fmtNumber(ownerCount)}</em>
        {/if}
      </header>

      {#if owners.length}
        <div>
          {#each sortedOwnersForDisplay(owners, 3) as owner}
      {@const portrait = ownerPortrait(owner)}
      {@const name = ownerName(owner)}
      <article>
        <b class:has-portrait={!!portrait}>
          {#if portrait}
            <img src={portrait} alt={name} loading="lazy" decoding="async" />
          {:else}
            {name.slice(0, 1)}
          {/if}
        </b>
        <span>{name}</span>
      </article>
    {/each}
        </div>
      {:else}
        <p>Owner context loads when available.</p>
      {/if}
    </section>

    <footer class="command-preview-footer">
      <span>{fmtNumber(copyCount || 0)} copies</span>
      <span>{fmtNumber(ownerCount || 0)} owners</span>
      <button type="button" on:click={() => onOpen(item)}>
        Open profile
      </button>
    </footer>
  {/if}
</aside>


<style>
  .command-preview-people b.has-portrait {
    overflow: hidden;
    padding: 0;
  }

  .command-preview-people b img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

/* owner identity avatar portraits */
</style>
