<script>
  import { onMount } from 'svelte';
  import { fetchRecentCrawlerAvatars } from '$lib/runtime/apiClient.js';

  let avatars = [];
  let loading = true;
  let error = '';
  let query = '';
  let lastLoadedAt = null;

  $: normalizedQuery = query.trim().toLocaleLowerCase();
  $: filtered = normalizedQuery
    ? avatars.filter((avatar) =>
        [avatar.name, avatar.avatar_id, avatar.gender]
          .some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery))
      )
    : avatars;

  async function load() {
    loading = true;
    error = '';
    try {
      const response = await fetchRecentCrawlerAvatars();
      avatars = Array.isArray(response?.avatars) ? response.avatars : [];
      lastLoadedAt = new Date();
    } catch (caught) {
      avatars = [];
      error = caught?.message || 'Recent crawler avatars could not be loaded.';
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Captured avatar configs · Observatory</title>
</svelte:head>

<header class="ops-page-header">
  <div>
    <p>CAPTURE RECEIPTS</p>
    <h1>Captured avatar configs</h1>
    <span>
      Exact config receipts only. A portrait inventory is not shown here unless a crawler captured its configuration.
    </span>
  </div>
  <button type="button" on:click={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
</header>

<section class="avatar-toolbar">
  <label>
    <span class="sr-only">Filter captured avatars</span>
    <input bind:value={query} placeholder="Filter by avatar name, ID, or gender…" />
  </label>
  <div>
    <strong>{filtered.length}</strong>
    <span>of {avatars.length} verified receipts</span>
    {#if lastLoadedAt}<em>loaded {lastLoadedAt.toLocaleTimeString()}</em>{/if}
  </div>
</section>

{#if error}
  <section class="avatar-state error">
    <strong>Capture receipt feed unavailable</strong>
    <span>{error}</span>
  </section>
{:else if loading && avatars.length === 0}
  <section class="avatar-state">
    <strong>Reading config receipts…</strong>
    <span>Waiting for the canonical capture store.</span>
  </section>
{:else if filtered.length === 0}
  <section class="avatar-state">
    <strong>{avatars.length ? 'No matching config receipts' : 'No captured avatar configs yet'}</strong>
    <span>{avatars.length ? 'Clear the filter to see the current verified receipts.' : 'Portraits alone are intentionally not shown as live crawler output.'}</span>
  </section>
{:else}
  <div class="avatar-table-wrap">
    <table>
      <thead>
        <tr>
          <th>Avatar</th>
          <th>Captured</th>
          <th>Crawler</th>
          <th>Generation</th>
          <th><span class="sr-only">Open renderer</span></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as avatar (avatar.avatar_id)}
          <tr>
            <td>
              <div class="avatar-identity">
                <img src={avatar.thumb_url} alt="" loading="lazy" />
                <div>
                  <strong>{avatar.name || 'Unresolved avatar'}</strong>
                  <small>canonical identity</small>
                </div>
              </div>
            </td>
            <td><strong class="cell-title">{avatar.captured_at ? new Date(avatar.captured_at).toLocaleString() : 'recorded receipt'}</strong><small>{avatar.config_sha256 ? `config ${avatar.config_sha256.slice(0, 10)}` : 'config receipt'}</small></td>
            <td><strong class="cell-title">{avatar.crawler_profile || 'imported capture'}</strong></td>
            <td><strong class="cell-title mono">{avatar.generation_key ? `generation ${avatar.generation_key.slice(0, 12)}` : 'preserved capture'}</strong></td>
            <td class="action-cell">
              {#if avatar.render_url}
                <a href={avatar.render_url}>Inspect render</a>
              {:else}
                <span class="unavailable">No route</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .ops-page-header,
  .avatar-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .ops-page-header { margin-bottom: 27px; }
  .ops-page-header p { margin: 0 0 7px; color: #66c7c5; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; }
  h1 { margin: 0; color: #edf4f6; font-size: clamp(30px, 4vw, 42px); font-weight: 570; letter-spacing: -0.035em; }
  .ops-page-header > div > span { display: block; margin-top: 10px; color: #7f8e99; font-size: 13px; }

  button,
  .action-cell a {
    flex: 0 0 auto;
    padding: 8px 11px;
    border: 1px solid rgba(102, 199, 197, 0.24);
    border-radius: 7px;
    color: #cfe0e4;
    background: rgba(102, 199, 197, 0.07);
    font: inherit;
    font-size: 11px;
    text-decoration: none;
    cursor: pointer;
  }

  button:disabled { opacity: 0.5; cursor: wait; }

  .avatar-toolbar {
    padding: 11px;
    border: 1px solid rgba(190, 213, 220, 0.11);
    border-radius: 9px;
    background: rgba(14, 20, 27, 0.88);
  }

  .avatar-toolbar label { flex: 1; }
  .avatar-toolbar input {
    width: min(100%, 520px);
    padding: 9px 11px;
    border: 1px solid rgba(190, 213, 220, 0.12);
    border-radius: 6px;
    outline: none;
    color: #dbe6ea;
    background: #090d12;
    font-size: 12px;
  }

  .avatar-toolbar input:focus { border-color: rgba(102, 199, 197, 0.45); }
  .avatar-toolbar > div { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
  .avatar-toolbar strong { color: #e1eaed; font-size: 15px; }
  .avatar-toolbar span,
  .avatar-toolbar em { color: #71808b; font-size: 10px; font-style: normal; }
  .avatar-toolbar em { margin-left: 10px; }

  .avatar-table-wrap {
    overflow-x: auto;
    border: 1px solid rgba(190, 213, 220, 0.11);
    border-radius: 9px;
    background: rgba(13, 18, 24, 0.9);
  }

  table { width: 100%; min-width: 900px; border-collapse: collapse; }
  th { padding: 10px 14px; color: #657681; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-align: left; text-transform: uppercase; background: rgba(255, 255, 255, 0.012); }
  td { padding: 12px 14px; border-top: 1px solid rgba(190, 213, 220, 0.075); color: #9eabb3; font-size: 11px; vertical-align: middle; }
  tbody tr:hover { background: rgba(102, 199, 197, 0.025); }

  .avatar-identity { display: flex; align-items: center; gap: 11px; min-width: 235px; }
  .avatar-identity img { width: 42px; height: 42px; flex: 0 0 auto; border: 1px solid rgba(190, 213, 220, 0.13); border-radius: 7px; object-fit: cover; background: #080c11; }
  .avatar-identity > div { min-width: 0; display: grid; gap: 2px; }
  .avatar-identity strong,
  .cell-title { color: #d3dde1; font-size: 12px; font-weight: 570; }
  .avatar-identity small,
  td small { display: block; margin-top: 3px; color: #657580; font-size: 9px; }

  .mono { max-width: 180px; overflow: hidden; color: #71828c; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; text-overflow: ellipsis; }
  .unavailable { color: #697985; font-weight: 500; }
  .action-cell { text-align: right; }
  .action-cell a:hover { border-color: rgba(102, 199, 197, 0.48); color: white; }

  .avatar-state {
    display: grid;
    gap: 7px;
    padding: 40px;
    border: 1px dashed rgba(190, 213, 220, 0.14);
    border-radius: 9px;
    color: #71808b;
    text-align: center;
  }
  .avatar-state strong { color: #bfccd1; font-size: 14px; }
  .avatar-state span { font-size: 11px; }
  .avatar-state.error strong { color: #d2949b; }

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

  @media (max-width: 700px) {
    .ops-page-header { align-items: flex-start; }
    .avatar-toolbar { align-items: stretch; flex-direction: column; }
    .avatar-toolbar input { width: 100%; }
  }
</style>
