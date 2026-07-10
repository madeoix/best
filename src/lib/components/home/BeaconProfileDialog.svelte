<script>
  import { publicApiUrl } from '$lib/runtime/apiClient.js';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';
  import { getItemProfile } from '$lib/beacon/api.js';
  import { fmtNumber } from '$lib/beacon/format.js';

  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';

  export let open = false;
  export let item = null;

  let profile = null;
  let loading = false;
  let error = '';
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

  function niceDate(value) {
    if (!value) return '—';
    return String(value).replace('T', ' ').replace(/\.\d+$/, '');
  }

  function shortId(value) {
    if (!value) return '';
    const s = String(value);
    return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-5)}` : s;
  }

  async function loadProfile() {
    const current = ++requestId;

    profile = null;
    error = '';

    if (!sourceXml || !open) return;

    loading = true;

    try {
      const data = await getItemProfile(sourceXml);
      if (current !== requestId) return;

      if (!data?.ok) {
        throw new Error(data?.error || 'Profile unavailable');
      }

      profile = data;
    } catch (err) {
      if (current !== requestId) return;
      error = err?.message || 'Failed to load profile';
    } finally {
      if (current === requestId) loading = false;
    }
  }

  function copySource() {
    navigator.clipboard?.writeText(sourceXml);
  }

  $: if (open && sourceXml) {
    loadProfile();
  }

  $: displayItem = profile?.item || item;
  $: stats = profile?.stats || {};
  $: owners = profile?.owners || [];
  $: spaces = profile?.spaces || [];
  $: latest = profile?.latest || [];
  $: topOwner = owners.find((owner) => owner.avatar_name) || owners[0];
  $: topSpace = spaces.find((space) => space.space_name) || spaces[0];

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

    return publicApiUrl(`/api/beacon/avatar/badge?label=${label}&status=${status}`);
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

<Dialog.Dialog bind:open>
  <Dialog.DialogContent class="beacon-profile-workspace">
    {#if !item}
      <div class="profile-workspace-empty">
        <Dialog.DialogTitle>No item selected</Dialog.DialogTitle>
        <Dialog.DialogDescription>Pick an item from Search first.</Dialog.DialogDescription>
      </div>
    {:else if loading}
      <div class="profile-workspace-loading">
        <Skeleton class="workspace-skeleton-side" />
        <div>
          <Skeleton class="workspace-skeleton-title" />
          <Skeleton class="workspace-skeleton-line" />
          <Skeleton class="workspace-skeleton-line short" />
          <Skeleton class="workspace-skeleton-panel" />
          <Skeleton class="workspace-skeleton-panel" />
        </div>
      </div>
    {:else if error}
      <div class="profile-workspace-empty">
        <Dialog.DialogTitle>Profile unavailable</Dialog.DialogTitle>
        <Dialog.DialogDescription>{error}</Dialog.DialogDescription>
      </div>
    {:else if profile}
      <section class="profile-workspace-grid">
        <aside class="profile-workspace-rail">
          <div class="workspace-object">
            <SmallverseIcon item={displayItem} size="large" />
          </div>

          <div class="workspace-label">
            <p>{kind(displayItem)}</p>
            <Dialog.DialogTitle>{displayItem?.name || 'Unknown item'}</Dialog.DialogTitle>

            {#if displayItem?.description}
              <Dialog.DialogDescription>
                {displayItem.description}
              </Dialog.DialogDescription>
            {/if}
          </div>

          <section class="workspace-presence">
            <span>Current signal</span>

            {#if topSpace?.space_name}
              <strong>{topSpace.space_name}</strong>
              <em>
                {#if topOwner?.avatar_name}
                  associated with {topOwner.avatar_name}
                {:else}
                  owner unresolved
                {/if}
              </em>
            {:else if topOwner?.avatar_name}
              <strong>{topOwner.avatar_name}</strong>
              <em>associated avatar</em>
            {:else}
              <strong>Observatory record</strong>
              <em>context is limited</em>
            {/if}
          </section>

          <section class="workspace-record">
            <div>
              <span>Copies</span>
              <strong>{fmtNumber(stats.known_copies)}</strong>
            </div>
            <div>
              <span>Owners</span>
              <strong>{fmtNumber(stats.observed_owners)}</strong>
            </div>
            <div>
              <span>Spaces</span>
              <strong>{fmtNumber(stats.known_spaces)}</strong>
            </div>
          </section>

          <section class="workspace-meta">
            <span>Last observed</span>
            <strong>{niceDate(stats.latest_seen)}</strong>
          </section>

          <button type="button" class="workspace-copy" on:click={copySource}>
            Copy source XML
          </button>
        </aside>

        <main class="profile-workspace-main">
          <Tabs.Tabs value="overview" class="workspace-tabs">
            <div class="workspace-main-head">
              <div>
                <p>Item profile</p>
                <h2>{displayItem?.name || 'Unknown item'}</h2>
              </div>

              <Tabs.TabsList class="workspace-tab-list">
                <Tabs.TabsTrigger value="overview">Overview</Tabs.TabsTrigger>
                <Tabs.TabsTrigger value="evidence">Evidence</Tabs.TabsTrigger>
                <Tabs.TabsTrigger value="technical">Technical</Tabs.TabsTrigger>
              </Tabs.TabsList>
            </div>

            <Tabs.TabsContent value="overview" class="workspace-tab-panel">
              <section class="workspace-story">
                <p>Beacon currently knows this item through Observatory evidence.</p>

                {#if topSpace?.space_name && topOwner?.avatar_name}
                  <h3>
                    It most recently appears in <strong>{topSpace.space_name}</strong>,
                    associated with <strong>{topOwner.avatar_name}</strong>.
                  </h3>
                {:else if topSpace?.space_name}
                  <h3>
                    It most recently appears in <strong>{topSpace.space_name}</strong>.
                  </h3>
                {:else if topOwner?.avatar_name}
                  <h3>
                    It is currently associated with <strong>{topOwner.avatar_name}</strong>.
                  </h3>
                {:else}
                  <h3>
                    Beacon has a record for this item, but the social context is limited.
                  </h3>
                {/if}
              </section>

              <section class="workspace-overview-grid">
                <section class="workspace-panel">
                  <div class="workspace-section-head">
                    <h3>Associated avatars</h3>
                    <span>{fmtNumber(stats.observed_owners)} total</span>
                  </div>

                  <div class="workspace-avatar-grid">
                    {#each sortedOwnersForDisplay(owners, 8) as owner}
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
              <div>
                <strong>{name}</strong>
                <span>
                  {#if owner.avatar_candidate_count > 1}
                    {owner.avatar_candidate_count} avatar candidates
                  {:else if owner.avatar_portrait_status === 'captured_reference_unverified'}
                    portrait captured, not public
                  {:else}
                    {owner.latest_space_name || shortId(owner.owner_id) || 'space unresolved'}
                  {/if}
                </span>
              </div>
            </article>
          {/each}
                  </div>
                </section>

                <section class="workspace-panel">
                  <div class="workspace-section-head">
                    <h3>Known spaces</h3>
                    <span>{fmtNumber(stats.known_spaces)} total</span>
                  </div>

                  <div class="workspace-space-cards">
                    {#each spaces.slice(0, 6) as space}
                      <article>
                        <strong>{space.space_name || 'Unknown space'}</strong>
                        <span>
                          {#if space.latest_owner_name}
                            linked to {space.latest_owner_name}
                          {:else}
                            owner unresolved
                          {/if}
                        </span>
                      </article>
                    {/each}
                  </div>
                </section>
              </section>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="evidence" class="workspace-tab-panel">
              <section class="workspace-panel">
                <div class="workspace-section-head">
                  <h3>Latest evidence</h3>
                  <span>{fmtNumber(latest.length)} entries</span>
                </div>

                <div class="workspace-evidence-table">
                  <header>
                    <span>Avatar</span>
                    <span>Space</span>
                    <span>Observed</span>
                    <span>UID</span>
                  </header>

                  {#each latest as row}
                    <article>
                      <strong>{row.avatar_name || shortId(row.owner_id) || 'Unknown avatar'}</strong>
                      <span>{row.space_name || 'space unresolved'}</span>
                      <span>{niceDate(row.observed_at)}</span>
                      <code>{shortId(row.uid)}</code>
                    </article>
                  {/each}
                </div>
              </section>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="technical" class="workspace-tab-panel">
              <section class="workspace-panel">
                <div class="workspace-section-head">
                  <h3>Technical truth</h3>
                  <span>raw record</span>
                </div>

                <dl class="workspace-technical-list">
                  <div>
                    <dt>Source XML</dt>
                    <dd>{sourceXml}</dd>
                  </div>
                  <div>
                    <dt>Profile source</dt>
                    <dd>{profile.source}</dd>
                  </div>
                  <div>
                    <dt>Cache generated</dt>
                    <dd>{profile.cache_generated_at || '—'}</dd>
                  </div>
                  <div>
                    <dt>Crawler observations</dt>
                    <dd>{fmtNumber(stats.crawler_observations)}</dd>
                  </div>
                  <div>
                    <dt>Identity</dt>
                    <dd>{profile.technical?.owner_candidates_used ? 'owner candidates resolved' : 'unresolved'}</dd>
                  </div>
                </dl>
              </section>
            </Tabs.TabsContent>
          </Tabs.Tabs>
        </main>
      </section>
    {/if}
  </Dialog.DialogContent>
</Dialog.Dialog>


<style>
  .workspace-avatar-grid b.has-portrait {
    overflow: hidden;
    padding: 0;
  }

  .workspace-avatar-grid b img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

/* owner identity avatar portraits */
</style>
