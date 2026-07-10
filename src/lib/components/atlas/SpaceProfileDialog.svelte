<script>
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import { fmtNumber } from '$lib/beacon/format.js';
  import SmallverseIcon from '$lib/components/common/SmallverseIcon.svelte';

  export let open = false;
  export let loading = false;
  export let error = '';
  export let profile = null;

  const dispatch = createEventDispatcher();

  let wasOpen = false;

  $: {
    if (wasOpen && !open) dispatch('close');
    wasOpen = open;
  }

  $: valid = profile?.contract === 'smallverse-beacon-space-profile/v2';
  $: data = valid ? profile.profile : null;
  $: space = data?.space || null;
  $: title = space?.display_name || space?.space_name || 'Space profile';
  $: image = data?.images?.[0]?.url || space?.snapshot_url || space?.thumb_url || '';
  $: usefulItems = data?.useful_items || [];
  $: owners = data?.owners || [];
  $: avatars = data?.avatars || [];
  $: evidence = data?.evidence || [];
  $: filteredNoise = data?.filtered_noise || { count: 0, examples: [] };

  function ownerPortrait(owner) {
    return (
      owner?.avatar_portrait_thumb_url ||
      owner?.avatar_portrait_url ||
      owner?.avatar_portrait_snapshot_url ||
      ''
    );
  }

  function initials(value) {
    const text = String(value || '').trim();
    if (!text) return '?';
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }
</script>

<Dialog.Dialog bind:open>
  <Dialog.DialogContent class="space-profile-dialog">
    {#if loading}
      <section class="space-profile-loading">
        <Skeleton class="space-profile-loading-art" />
        <div>
          <Skeleton class="space-profile-loading-line wide" />
          <Skeleton class="space-profile-loading-line" />
          <Skeleton class="space-profile-loading-line short" />
        </div>
      </section>
    {:else if error}
      <section class="space-profile-empty">
        <b>{error}</b>
        <span>Beacon did not fabricate a profile fallback.</span>
      </section>
    {:else if profile && !valid}
      <section class="space-profile-empty">
        <b>Outdated space profile contract.</b>
        <span>This profile is not v2, so Beacon refused to render stale raw object-count junk.</span>
      </section>
    {:else if data && space}
      <section class="space-profile-grid">
        <aside class="space-profile-rail">
          <div class="space-profile-image">
            {#if image}
              <img src={image} alt={title} />
            {:else}
              <span>No space preview</span>
            {/if}
          </div>

          <div class="space-profile-title">
            <p>{space.kind || 'space profile'}</p>
            <Dialog.DialogTitle>{title}</Dialog.DialogTitle>

            {#if space.reasons?.length}
              <Dialog.DialogDescription>{space.reasons.join(' · ')}</Dialog.DialogDescription>
            {/if}
          </div>

          <section class="space-profile-facts">
            <div>
              <span>Useful items</span>
              <strong>{fmtNumber(usefulItems.length)}</strong>
            </div>
            <div>
              <span>Owners</span>
              <strong>{fmtNumber(owners.length)}</strong>
            </div>
            <div>
              <span>Filtered</span>
              <strong>{fmtNumber(filteredNoise.count || 0)}</strong>
            </div>
          </section>

          <div class="space-profile-badges">
            <Badge variant="secondary">v2 profile</Badge>
            <Badge variant="outline">promoted only</Badge>
            {#if avatars.length === 0}
              <Badge variant="outline">owner IDs only</Badge>
            {/if}
          </div>

          <Button variant="outline" on:click={() => navigator.clipboard?.writeText(space.space_id)}>
            Copy space ID
          </Button>
        </aside>

        <main class="space-profile-main">
          <header>
            <div>
              <p>Backend contract</p>
              <h2>{title}</h2>
            </div>

            <span>{profile.contract}</span>
          </header>

          <Tabs.Tabs value="items" class="space-profile-tabs">
            <Tabs.TabsList>
              <Tabs.TabsTrigger value="items">Useful items</Tabs.TabsTrigger>
              <Tabs.TabsTrigger value="owners">Owners</Tabs.TabsTrigger>
              <Tabs.TabsTrigger value="evidence">Evidence</Tabs.TabsTrigger>
              <Tabs.TabsTrigger value="filtered">Filtered</Tabs.TabsTrigger>
              <Tabs.TabsTrigger value="technical">Truth</Tabs.TabsTrigger>
            </Tabs.TabsList>

            <Tabs.TabsContent value="items">
              <div class="space-profile-section-head">
                <h3>Useful item signals</h3>
                <span>{fmtNumber(usefulItems.length)} rare / legendary / promoted rows</span>
              </div>

              <div class="space-item-grid">
                {#each usefulItems as item}
                  <article class="space-item-card">
                    <SmallverseIcon item={item} />
                    <div>
                      <strong>{item.name || item.source_xml}</strong>
                      <span>
                        {fmtNumber(item.observation_count || 0)} evidence rows
                        {#if item.signal_reasons?.length}
                          · {item.signal_reasons.join(', ')}
                        {/if}
                      </span>
                    </div>
                  </article>
                {/each}
              </div>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="owners">
              <div class="space-profile-section-head">
                <h3>Observed owners</h3>
                <span>{fmtNumber(owners.length)} owner IDs · {fmtNumber(avatars.length)} resolved avatars</span>
              </div>

              <div class="space-owner-grid">
                {#each owners as owner}
                  {@const portrait = ownerPortrait(owner)}
                  <article class="space-owner-card owner-card-with-avatar">
                    <div class="owner-avatar">
                      {#if portrait}
                        <img
                          src={portrait}
                          alt={owner.avatar_name || owner.owner_id}
                          loading="lazy"
                          decoding="async"
                        />
                      {:else}
                        <span>{initials(owner.avatar_name || owner.owner_id)}</span>
                      {/if}
                    </div>

                    <div class="owner-card-copy">
                      <strong>{owner.avatar_name || owner.owner_id}</strong>
                      <code>{owner.owner_id}</code>
                      <span>
                        {fmtNumber(owner.evidence_count || 0)} evidence rows
                        {#if owner.latest_seen}
                          · {owner.latest_seen}
                        {/if}
                      </span>

                      <small>
                        {#if owner.avatar_portrait_source === 'avatar-url-index.saz'}
                          portrait from SAZ
                        {:else if owner.avatar_id}
                          avatar identity only
                        {:else}
                          owner identity unresolved
                        {/if}
                      </small>
                    </div>
                  </article>
                {/each}
              </div>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="evidence">
              <div class="space-profile-section-head">
                <h3>Promoted evidence feed</h3>
                <span>{fmtNumber(evidence.length)} latest rows</span>
              </div>

              <div class="space-evidence-feed">
                {#each evidence as row}
                  <article>
                    <time>{row.observed_at || 'unknown time'}</time>
                    <strong>{row.event_type || row.protocol || 'event'}</strong>
                    <span>{row.source_xml || row.uid || row.owner_id || 'no object id'}</span>
                  </article>
                {/each}
              </div>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="filtered">
              <div class="space-profile-section-head">
                <h3>Filtered scene noise</h3>
                <span>{fmtNumber(filteredNoise.count || 0)} non-promoted object signals</span>
              </div>

              <div class="space-owner-grid">
                {#each filteredNoise.examples || [] as item}
                  <article class="space-owner-card">
                    <strong>{item.name || item.source_xml}</strong>
                    <span>{fmtNumber(item.observation_count || 0)} rows · {item.reason}</span>
                  </article>
                {/each}
              </div>
            </Tabs.TabsContent>

            <Tabs.TabsContent value="technical">
              <dl class="space-profile-technical-list">
                <div>
                  <dt>Space ID</dt>
                  <dd>{space.space_id || '—'}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{profile.generated_at || '—'}</dd>
                </div>
                <div>
                  <dt>Promotion rule</dt>
                  <dd>{data.technical?.promotion_rule || '—'}</dd>
                </div>
                <div>
                  <dt>Raw item signals</dt>
                  <dd>{fmtNumber(data.technical?.raw_item_signals || 0)}</dd>
                </div>
                <div>
                  <dt>Source DB</dt>
                  <dd>{data.technical?.source_db || '—'}</dd>
                </div>
              </dl>
            </Tabs.TabsContent>
          </Tabs.Tabs>
        </main>
      </section>
    {:else}
      <section class="space-profile-empty">
        <b>No profile selected.</b>
        <span>Open a space from Atlas.</span>
      </section>
    {/if}
  </Dialog.DialogContent>
</Dialog.Dialog>


<style>
  :global(.owner-card-with-avatar) {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 0.75rem;
    align-items: center;
  }

  :global(.owner-avatar) {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }

  :global(.owner-avatar img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  :global(.owner-avatar span) {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    opacity: 0.8;
  }

  :global(.owner-card-copy) {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  :global(.owner-card-copy code) {
    font-size: 0.7rem;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.owner-card-copy small) {
    font-size: 0.72rem;
    opacity: 0.7;
  }
</style>
