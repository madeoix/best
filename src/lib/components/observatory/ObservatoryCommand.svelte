<script>
  export let query = '';
  export let loading = false;

  export let onSearch = () => {};
</script>

<form class="module-command" on:submit|preventDefault={() => onSearch(query)}>
  <input
    bind:value={query}
    placeholder="Search items, tags, XML…"
    autocomplete="off"
    spellcheck="false"
  />

  <button disabled={loading}>
    {loading ? 'Searching' : 'Search'}
  </button>
</form>
