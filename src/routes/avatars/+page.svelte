<script>
  import { onDestroy } from 'svelte';
  import { publicRequestJson } from '$lib/runtime/apiClient.js';

  let query = '';
  let results = [];
  let loading = false;
  let error = '';
  let debounce;
  let request = 0;

  function updateQuery(value) {
    query = value;
    clearTimeout(debounce);
    const term = value.trim();
    if (!term) {
      results = [];
      error = '';
      return;
    }
    debounce = setTimeout(() => search(term), 220);
  }

  async function search(term) {
    const version = ++request;
    loading = true;
    error = '';
    try {
      const payload = await publicRequestJson(`/api/v1/avatars?q=${encodeURIComponent(term)}&limit=24`);
      if (version !== request) return;
      results = (payload?.data || []).filter((avatar) => avatar?.avatarId && avatar?.name && avatar?.thumbnailStorageKey);
    } catch (caught) {
      if (version !== request) return;
      results = [];
      error = caught?.message || 'Avatar lookup failed.';
    } finally {
      if (version === request) loading = false;
    }
  }

  onDestroy(() => clearTimeout(debounce));
</script>

<svelte:head><title>Find an avatar · Smallverse Beacon</title></svelte:head>

<main class="lookup">
  <p class="eyebrow">AVATAR LOOKUP</p>
  <h1>Find an avatar</h1>
  <p class="intro">Search by a known name. Beacon does not turn a crawler’s bulk friend-search cache into a public directory.</p>

  <label class="search">
    <span class="sr-only">Avatar name</span>
    <input value={query} on:input={(event) => updateQuery(event.currentTarget.value)} placeholder="Start typing an avatar name…" autocomplete="off" />
    {#if loading}<span>Searching</span>{/if}
  </label>

  {#if error}
    <p class="state">{error}</p>
  {:else if query.trim() && !loading && results.length === 0}
    <p class="state">No profile-ready avatar matches that name.</p>
  {:else if results.length}
    <section class="results" aria-label="Avatar matches">
      {#each results as avatar (avatar.avatarId)}
        <a href={`/avatar/${encodeURIComponent(avatar.avatarId)}`}>
          <img src={avatar.thumbnailStorageKey} alt="" loading="lazy" />
          <strong>{avatar.name}</strong>
          <span>Open profile →</span>
        </a>
      {/each}
    </section>
  {/if}
</main>

<style>
  .lookup{width:min(720px,calc(100% - 40px));margin:0 auto;padding:clamp(72px,14vh,160px) 0;color:var(--beacon-text)}
  .eyebrow{margin:0 0 13px;color:var(--beacon-accent);font-size:10px;font-weight:700;letter-spacing:.16em}.lookup h1{margin:0;font-size:clamp(42px,7vw,74px);font-weight:520;letter-spacing:-.055em}.intro{max-width:560px;margin:18px 0 34px;color:var(--beacon-text-muted);line-height:1.65}
  .search{display:flex;align-items:center;border-bottom:1px solid var(--beacon-border);background:var(--beacon-surface-1)}.search input{width:100%;min-height:58px;border:0;padding:0 18px;background:transparent;color:inherit;font:inherit;font-size:17px}.search input:focus{outline:2px solid color-mix(in srgb,var(--beacon-accent) 45%,transparent);outline-offset:-2px}.search span{padding-right:16px;color:var(--beacon-text-faint);font-size:11px}
  .results{margin-top:28px;border-top:1px solid var(--beacon-divider)}.results a{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:15px;padding:12px 3px;border-bottom:1px solid var(--beacon-divider);color:inherit;text-decoration:none}.results a:hover{color:var(--beacon-accent)}.results img{width:52px;height:52px;object-fit:contain;background:var(--beacon-surface-1)}.results strong{font-size:15px;font-weight:570}.results span,.state{color:var(--beacon-text-faint);font-size:11px}.state{margin-top:28px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  @media(max-width:640px){.lookup{width:min(100% - 28px,720px)}.results a{grid-template-columns:44px 1fr}.results img{width:44px;height:44px}.results span{display:none}}
</style>
