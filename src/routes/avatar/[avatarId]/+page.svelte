<script>
  import { page } from '$app/stores';
  import SmallverseAvatarOracleImage from '$lib/components/avatar/SmallverseAvatarOracleImage.svelte';
  import { publicRequestJson } from '$lib/runtime/apiClient.js';

  let profile = null;
  let error = '';
  let loading = true;

  $: avatarId = $page.params.avatarId;
  $: if (avatarId) loadProfile(avatarId);

  async function loadProfile(id) {
    loading = true;
    error = '';

    try {
      const data = await publicRequestJson(
        `/api/beacon/avatar/profile?avatar_id=${encodeURIComponent(id)}`
      );

      if (data?.ok === false) {
        throw new Error(data?.error || 'Avatar profile unavailable');
      }

      profile = data;
    } catch (err) {
      error = err.message || String(err);
    } finally {
      loading = false;
    }
  }

  $: bodyRenderManifestUrl = profile?.avatar?.avatar_id
    ? `/avatar-renders/${profile.avatar.avatar_id}/body-render-manifest.json`
    : null;

  $: renderUrl =
    profile?.render_packet?.full_body_url ||
    profile?.avatar?.render_url ||
    profile?.avatar?.snapshot_url ||
    profile?.avatar?.head_url;
</script>

<svelte:head>
  <title>{profile?.avatar?.display_name || 'Avatar'} · Beacon</title>
</svelte:head>

<main class="avatar-page">

  <a class="flash-render-link" href={`/avatar-render/${avatarId}`}>
    Open verified Flash render stage
  </a>

  {#if loading}
    <section class="hero-card">
      <p class="eyebrow">Beacon avatar</p>
      <h1>Loading avatar profile...</h1>
    </section>
  {:else if error}
    <section class="hero-card error">
      <p class="eyebrow">Beacon avatar</p>
      <h1>Could not load avatar</h1>
      <p>{error}</p>
    </section>
  {:else if profile}
    <section class="hero-grid">
      <div class="avatar-render-card">
        {#if bodyRenderManifestUrl}
          <SmallverseAvatarOracleImage manifestUrl={bodyRenderManifestUrl} headUrl={profile.avatar.head_url}  />
        {:else if renderUrl}
          <img class="avatar-render" src={renderUrl} alt={profile.avatar.display_name || profile.avatar.avatar_id} />
        {:else}
          <div class="missing-render">No render available</div>
        {/if}
        <span>Drag to rotate body renderer MVP</span>
      </div>

      <div class="identity-card">
        <p class="eyebrow">Beacon avatar</p>
        <h1>{profile.avatar.display_name || 'Unknown avatar'}</h1>
        <p class="avatar-id">{profile.avatar.avatar_id}</p>

        <div class="render-strip">
          {#if profile.render_packet?.thumb_url || profile.avatar.thumb_url}
            <img src={profile.render_packet?.thumb_url || profile.avatar.thumb_url} alt="Thumb render" />
          {/if}
          {#if profile.avatar.head_url}
            <img src={profile.avatar.head_url} alt="Head render" />
          {/if}
          {#if profile.render_packet?.preview_url || profile.avatar.snapshot_url}
            <img src={profile.render_packet?.preview_url || profile.avatar.snapshot_url} alt="Preview render" />
          {/if}
        </div>

        <div class="stats-grid">
          <div><strong>{profile.stats?.owner_count ?? 0}</strong><span>known owners</span></div>
          <div><strong>{profile.stats?.associated_item_count ?? 0}</strong><span>item signals</span></div>
          <div><strong>{profile.stats?.associated_space_count ?? 0}</strong><span>space links</span></div>
          <div><strong>{profile.stats?.asset_count ?? 0}</strong><span>render assets</span></div>
        </div>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel">
        <p class="eyebrow">Ownership</p>
        <h2>Known owner links</h2>
        {#if profile.owners?.length}
          {#each profile.owners as owner}
            <div class="row">
              <strong>{owner.display_name || owner.owner_id}</strong>
              <span>{owner.owner_id}</span>
            </div>
          {/each}
        {:else}
          <p class="muted">No owner links yet.</p>
        {/if}
      </article>

      <article class="panel">
        <p class="eyebrow">Spaces</p>
        <h2>Associated spaces</h2>
        {#if profile.spaces?.length}
          {#each profile.spaces as space}
            <div class="row">
              <strong>{space.space_name || space.name || 'Unknown space'}</strong>
              <span>{space.space_id}</span>
            </div>
          {/each}
        {:else}
          <p class="muted">No space links yet.</p>
        {/if}
      </article>

      <article class="panel wide">
        <p class="eyebrow">Item graph</p>
        <h2>Associated item signals</h2>
        {#if profile.items?.length}
          {#each profile.items as item}
            <div class="row">
              <strong>{item.item_name || item.name || item.source_xml || 'Unknown item'}</strong>
              <span>{item.rarity || ''} · {item.owner_count || 0} owners</span>
            </div>
          {/each}
        {:else}
          <p class="muted">No associated item signals yet.</p>
        {/if}
      </article>
    </section>
  {/if}
</main>

<style>
.avatar-page {
    min-height: 100vh;
    padding: 48px;
    color: #eef6ff;
    background:
      radial-gradient(circle at top right, rgba(56, 115, 255, 0.18), transparent 34rem),
      linear-gradient(180deg, #071017, #05080d);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) minmax(320px, 0.9fr);
    gap: 24px;
    max-width: 1180px;
    margin: 0 auto 24px;
  }

  .hero-card,
  .avatar-render-card,
  .identity-card,
  .panel {
    border: 1px solid rgba(151, 190, 255, 0.12);
    background: rgba(13, 22, 31, 0.82);
    border-radius: 22px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  }

  .hero-card {
    max-width: 920px;
    margin: 0 auto;
    padding: 36px;
  }

  .avatar-render-card {
    min-height: 460px;
    display: grid;
    place-items: center;
    padding: 32px;
    background:
      radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.09), transparent 11rem),
      rgba(13, 22, 31, 0.82);
  }

  .avatar-render-card span {
    align-self: end;
    color: #7f90a3;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .avatar-render {
    max-width: 80%;
    max-height: 350px;
    image-rendering: auto;
    object-fit: contain;
  }

  .identity-card {
    padding: 36px;
  }

  .eyebrow {
    margin: 0 0 12px;
    color: #6bb8ff;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(40px, 6vw, 72px);
    font-weight: 400;
    letter-spacing: -0.06em;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
  }

  .avatar-id {
    color: #8190a3;
    font-size: 13px;
  }

  .render-strip {
    display: flex;
    gap: 12px;
    margin: 24px 0;
  }

  .render-strip img {
    width: 52px;
    height: 52px;
    object-fit: contain;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(151, 190, 255, 0.12);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(80px, 1fr));
    gap: 12px;
  }

  .stats-grid div {
    padding: 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.045);
  }

  .stats-grid strong {
    display: block;
    font-size: 24px;
  }

  .stats-grid span,
  .muted {
    color: #8190a3;
    font-size: 12px;
  }

  .content-grid {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .panel {
    padding: 24px;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-top: 1px solid rgba(151, 190, 255, 0.08);
  }

  .row span {
    color: #8190a3;
    font-size: 12px;
    text-align: right;
  }

  .error {
    border-color: rgba(255, 107, 107, 0.4);
  }

  .missing-render {
    color: #8190a3;
  }

:global(.flash-render-link) {
    display: inline-flex;
    margin: 12px 0;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(137, 216, 255, 0.3);
    background: rgba(8, 20, 38, 0.75);
    color: #aee8ff;
    text-decoration: none;
    font-weight: 700;
  }
</style>



