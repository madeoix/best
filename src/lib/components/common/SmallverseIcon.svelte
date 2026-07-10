<script>
  import { bestItemIconPath, smallverseIconUrl } from '$lib/beacon/assets.js';

  export let item = null;
  export let size = 'normal';

  let failedSrc = '';

  $: iconPath = bestItemIconPath(item);
  $: src = smallverseIconUrl(iconPath);
  $: failed = src && failedSrc === src;

  function handleError() {
    failedSrc = src;
  }
</script>

<div class="sv-icon" class:size-large={size === 'large'}>
  {#if src && !failed}
    <img
      src={src}
      alt={item?.name ? `${item.name} icon` : ''}
      loading="lazy"
      decoding="async"
      on:error={handleError}
    />
  {:else}
    <span>no icon</span>
  {/if}
</div>
