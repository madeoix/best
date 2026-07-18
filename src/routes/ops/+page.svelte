<script>
  import { getContext, onMount } from 'svelte';
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';
  import { OPS_CONTEXT_KEY } from '$lib/ops/context.js';
  import { getDesktopCrawlerCredentials } from '$lib/runtime/desktopBridge.js';
  import CrawlerCredentialsDialog from '$lib/components/shell/CrawlerCredentialsDialog.svelte';

  const ops = getContext(OPS_CONTEXT_KEY);
  const access = ops.access;
  let crawlerPanel = null;
  let crawlerError = '';
  let crawlerLoading = true;
  let crawlerCredentialsOpen = false;

  $: overview = $access.overview || {};
  $: workspace = overview.workspace || {};
  $: generations = workspace.captureGenerations || {};
  $: canonical = overview.canonical || null;
  $: profiles = crawlerPanel?.profiles || [];

  async function loadCrawlers() {
    crawlerLoading = true;
    crawlerError = '';
    try {
      crawlerPanel = await getDesktopCrawlerCredentials();
    } catch (error) {
      crawlerPanel = null;
      crawlerError = error?.message || 'Crawler status could not be read.';
    } finally {
      crawlerLoading = false;
    }
  }

  onMount(loadCrawlers);
</script>

<svelte:head>
  <title>Observatory · Beacon</title>
</svelte:head>

<header class="ops-page-header">
  <div>
    <p>OPERATOR OVERVIEW</p>
    <h1>Crawler operations</h1>
    <span>Login state, last successful capture, and whether each crawler can work.</span>
  </div>
  <div class="ops-page-actions">
    <button type="button" class="secondary" on:click={loadCrawlers} disabled={crawlerLoading}>
      {crawlerLoading ? 'Refreshing…' : 'Refresh status'}
    </button>
    <button type="button" on:click={() => (crawlerCredentialsOpen = true)}>
      Manage crawler logins
    </button>
  </div>
</header>

<CrawlerCredentialsDialog
  bind:open={crawlerCredentialsOpen}
  on:updated={loadCrawlers}
/>

<section class="ops-section">
  <header>
    <div>
      <p>DEDICATED ACCOUNTS</p>
      <h2>Crawler sessions</h2>
    </div>
    {#if crawlerPanel}
      <span>{crawlerPanel.backend || 'unknown keyring'} · {crawlerPanel.keyringAvailable ? 'keyring ready' : 'keyring unavailable'}</span>
    {/if}
  </header>

  {#if crawlerError}
    <div class="inline-state error">{crawlerError}</div>
  {:else if crawlerLoading && !crawlerPanel}
    <div class="inline-state">Reading crawler state from the desktop runtime…</div>
  {:else if profiles.length === 0}
    <div class="inline-state">No dedicated crawler profiles were reported.</div>
  {:else}
    <div class="crawler-list">
      {#each profiles as profile}
        {@const generation = generations[profile.profile]}
        <article class="crawler-row">
          <header>
            <div>
              <span class:ready={profile.sessionReady} class="status-dot"></span>
              <strong>{profile.profile}</strong>
              <small>{profile.profile === 'crawler-02' ? 'avatar discovery + configs' : 'popular spaces + object evidence'}</small>
            </div>
            <em>{profile.sessionReady ? 'session ready' : 'renewal required'}</em>
          </header>
          <dl>
            <div><dt>Login</dt><dd>{profile.sessionReady ? 'ready' : 'renewal required'}</dd></div>
            <div><dt>Collector</dt><dd>{profile.collectorActive === 'active' ? 'running on schedule' : profile.collectorActive || 'unknown'}</dd></div>
            <div><dt>Avatar harvester</dt><dd>{profile.harvestActive === 'active' ? 'running on schedule' : profile.harvestActive || 'unknown'}</dd></div>
            <div><dt>Last session capture</dt><dd>{fmtDate(profile.capturedAt)}</dd></div>
            <div><dt>VPS session</dt><dd>{profile.remoteSynced ? 'synchronized' : 'not confirmed'}</dd></div>
            <div><dt>Last generation</dt><dd>{generation?.available ? `${generation.outcome} · ${fmtDate(generation.completedAt)}` : 'no synchronized receipt'}</dd></div>
            <div><dt>Popular rooms</dt><dd>{generation?.available ? `${fmtNumber(generation.counts?.selectedSpaces || 0)} selected · ${fmtNumber(generation.counts?.joinedSpaces || 0)} fully joined` : 'not measured'}</dd></div>
            <div><dt>Next action</dt><dd>{!profile.sessionReady ? 'log in again' : profile.collectorActive !== 'active' ? 'collector needs enabling' : 'none'}</dd></div>
          </dl>
          {#if profile.renewalMessage}
            <p>{profile.renewalMessage}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

{#if canonical}
  <section class="ops-section">
    <header><div><p>CANONICAL PIPELINE</p><h2>Actionable backlog</h2></div></header>
    <div class="pipeline-list">
      <div><strong>Incomplete public identities</strong><small>{fmtNumber(canonical.publicationBacklog?.length || 0)} records blocked from publication</small></div>
      <div><strong>Enrichment jobs</strong><small>{fmtNumber(canonical.jobs?.filter((job) => job.status === 'queued').length || 0)} queued · {fmtNumber(canonical.jobs?.filter((job) => job.status === 'failed').length || 0)} failed</small></div>
      <div><strong>Renderer parity</strong><small>{fmtNumber(canonical.rendererParity?.filter((row) => row.status === 'matched').length || 0)} matched · {fmtNumber(canonical.rendererParity?.filter((row) => row.status === 'mismatch').length || 0)} mismatched</small></div>
      <div><strong>UID variants</strong><small>{fmtNumber(canonical.uidVariants?.filter((row) => row.status === 'rendered').length || 0)} rendered · {fmtNumber(canonical.uidVariants?.filter((row) => row.status === 'failed').length || 0)} failed</small></div>
      <div><strong>Immutable generations</strong><small>{canonical.generations?.[0] ? `${canonical.generations[0].outcome} · ${fmtDate(canonical.generations[0].completedAt)}` : 'no canonical generation imported yet'}</small></div>
      <div><strong>Exact live relationships</strong><small>{fmtNumber(canonical.metrics?.counts?.exactEquippedObservations || 0)} equipped-item observations · {fmtNumber(canonical.metrics?.counts?.avatarSpaceObservations || 0)} avatar-space observations</small></div>
      <div><strong>Render inputs</strong><small>{fmtNumber(canonical.metrics?.counts?.avatarConfigSnapshots || 0)} authoritative avatar config snapshots · {fmtNumber(canonical.metrics?.counts?.renderedVariants || 0)} UID variants</small></div>
    </div>
  </section>
{/if}

<section class="ops-section">
  <header>
    <div>
      <p>CAPTURE WORKSPACE</p>
      <h2>Evidence pipeline</h2>
    </div>
  </header>
  <div class="pipeline-list">
    <div>
      <span class:ready={workspace.boundedExport?.available} class="status-dot"></span>
      <strong>Bounded preserved evidence</strong>
      <small>{workspace.boundedExport?.available ? `${fmtNumber(workspace.boundedExport.count)} preserved observations available for canonical import · updated ${fmtDate(workspace.boundedExport.updatedAt)}` : 'bounded evidence export is missing; the multi-gigabyte source is never loaded here'}</small>
    </div>
    <div>
      <span class:ready={workspace.avatarCaptureManifest?.available} class="status-dot"></span>
      <strong>Captured avatar configs</strong>
      <small>{workspace.avatarCaptureManifest?.available ? `${fmtNumber(workspace.avatarCaptureManifest.count)} verified RTMP configs · updated ${fmtDate(workspace.avatarCaptureManifest.updatedAt)}` : 'no RTMP avatar manifest synchronized'}</small>
    </div>
    <div>
      <span class:ready={workspace.avatarRenderQueue?.available} class="status-dot"></span>
      <strong>Avatar render queue</strong>
      <small>{workspace.avatarRenderQueue?.available ? `${fmtNumber(workspace.avatarRenderQueue.count)} configs waiting or available to render · updated ${fmtDate(workspace.avatarRenderQueue.updatedAt)}` : 'no avatar render queue synchronized'}</small>
    </div>
    <div>
      <span class:ready={workspace.variantIcons?.available} class="status-dot"></span>
      <strong>Rendered UID variants</strong>
      <small>{workspace.variantIcons?.available ? `${fmtNumber(workspace.variantIcons.count)} cached UID-specific renders · updated ${fmtDate(workspace.variantIcons.updatedAt)}` : 'variant artifact directory is not synchronized'}</small>
    </div>
    <div>
      <span class:ready={overview.session?.ready} class="status-dot"></span>
      <strong>Manual login window</strong>
      <small>{overview.session?.ready ? `ready · ${fmtDate(overview.session.capturedAt)}` : 'open Manage crawler logins when renewal is required'}</small>
    </div>
  </div>
</section>

<style>
  .ops-page-header,
  .ops-section > header,
  .crawler-row header,
  .pipeline-list > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .ops-page-header {
    margin-bottom: 30px;
  }

  .ops-page-header p,
  .ops-section > header p {
    margin: 0 0 7px;
    color: #66c7c5;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  h1,
  h2 {
    margin: 0;
    color: #edf4f6;
    font-weight: 570;
    letter-spacing: -0.035em;
  }

  h1 { font-size: clamp(30px, 4vw, 42px); }
  h2 { font-size: 20px; }

  .ops-page-header > div > span,
  .ops-section > header > span {
    display: block;
    margin-top: 10px;
    color: #7f8e99;
    font-size: 13px;
  }

  button {
    flex: 0 0 auto;
    padding: 9px 12px;
    border: 1px solid rgba(102, 199, 197, 0.24);
    border-radius: 7px;
    color: #cfe0e4;
    background: rgba(102, 199, 197, 0.07);
    font-size: 12px;
    cursor: pointer;
  }

  button:disabled { opacity: 0.5; cursor: wait; }

  .ops-page-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  button.secondary {
    color: #8fa1ab;
    border-color: rgba(190, 213, 220, 0.13);
    background: rgba(190, 213, 220, 0.035);
  }

  .crawler-row dt,
  .pipeline-list small {
    color: #75848f;
    font-size: 11px;
  }

  .ops-section { margin-top: 34px; }
  .ops-section > header { margin-bottom: 13px; }

  .crawler-list { border-top:1px solid rgba(190,213,220,.12); }
  .crawler-row { padding:18px 2px; border-bottom:1px solid rgba(190,213,220,.12); }

  .crawler-row header > div {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .crawler-row header > div small {
    color: #75848f;
    font-size: 10px;
    font-weight: 400;
  }

  .crawler-row strong { color: #e4ecef; font-size: 14px; }

  .crawler-row em {
    color: #83919b;
    font-size: 10px;
    font-style: normal;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #aa6670;
  }

  .status-dot.ready {
    background: #5fc692;
    box-shadow: 0 0 0 3px rgba(95, 198, 146, 0.08);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 13px 20px;
    margin: 18px 0 0;
  }

  dl div { min-width: 0; }
  dt { margin-bottom: 4px; }
  dd { margin: 0; color: #becbd1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .crawler-row > p { margin: 15px 0 0; color: #9ba8b0; font-size: 11px; line-height: 1.5; }

  .pipeline-list { overflow: hidden; border-top:1px solid rgba(190,213,220,.12); }
  .pipeline-list > div { justify-content: flex-start; padding: 14px 16px; border-bottom: 1px solid rgba(190, 213, 220, 0.08); }
  .pipeline-list > div:last-child { border-bottom: 0; }
  .pipeline-list strong { min-width: 180px; color: #cdd8dc; font-size: 12px; }

  .inline-state {
    padding: 24px;
    border: 1px dashed rgba(190, 213, 220, 0.14);
    border-radius: 9px;
    color: #7f8e99;
    font-size: 12px;
  }

  .inline-state.error { color: #d2949b; }

  @media (max-width: 1000px) {
    dl { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }

  @media (max-width: 700px) {
    .ops-page-header { align-items: flex-start; }
    dl { grid-template-columns: 1fr; }
    .ops-section > header { align-items: flex-start; }
  }
</style>
