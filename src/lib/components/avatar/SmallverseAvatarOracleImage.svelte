<script>
  export let avatarId;
  export let thumbUrl = null;
  export let snapshotUrl = null;
  export let headUrl = null;
  export let size = 'profile';

  $: oracleBase = `/avatar-oracles/${avatarId}`;

  let flashThumbOk = false;
  let flashFullOk = false;
  let flashPreviewOk = false;
  let flashSnapshotOk = false;

  $: bestThumb = flashThumbOk
    ? `${oracleBase}/flash-thumb.png`
    : thumbUrl || headUrl || null;

  $: bestFull = flashFullOk
    ? `${oracleBase}/flash-full-body.png`
    : flashSnapshotOk
      ? `${oracleBase}/flash-saveAvatarSnapshot.png`
      : snapshotUrl || null;

  $: bestPreview = flashPreviewOk
    ? `${oracleBase}/flash-preview.png`
    : null;
</script>

<div class:size-profile={size === 'profile'} class:size-compact={size === 'compact'} class="oracle-card">
  <div class="hidden-preload">
    <img src={`${oracleBase}/flash-thumb.png`} alt="" on:load={() => (flashThumbOk = true)} />
    <img src={`${oracleBase}/flash-full-body.png`} alt="" on:load={() => (flashFullOk = true)} />
    <img src={`${oracleBase}/flash-preview.png`} alt="" on:load={() => (flashPreviewOk = true)} />
    <img src={`${oracleBase}/flash-saveAvatarSnapshot.png`} alt="" on:load={() => (flashSnapshotOk = true)} />
  </div>

  <div class="label">
    {#if flashSnapshotOk}
      Captured Flash saveAvatarSnapshot render
    {:else if flashFullOk || flashThumbOk || flashPreviewOk}
      Captured Flash saveAvatar render
    {:else if bestThumb || bestFull}
      Live SmallVerse render
    {:else}
      No verified render captured
    {/if}
  </div>

  <div class="renders">
    {#if bestThumb}
      <img class="thumb" src={bestThumb} alt="Avatar thumb render" />
    {/if}

    {#if bestFull}
      <img class="full" src={bestFull} alt="Avatar full-body render" />
    {:else if bestPreview}
      <img class="preview" src={bestPreview} alt="Avatar preview render" />
    {/if}

    {#if !bestThumb && !bestFull && !bestPreview}
      <div class="empty">No verified PNG evidence yet.</div>
    {/if}
  </div>
</div>

<style>
  .oracle-card {
    display: grid;
    gap: 10px;
  }

  .hidden-preload {
    display: none;
  }

  .label {
    font-size: 12px;
    color: rgba(232,238,248,0.72);
  }

  .renders {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  img {
    image-rendering: auto;
    background: #05070d;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 10px;
  }

  .thumb {
    width: 100px;
    height: 100px;
    object-fit: contain;
  }

  .full {
    width: 128px;
    height: 256px;
    object-fit: contain;
  }

  .preview {
    width: 348px;
    height: 194px;
    object-fit: contain;
  }

  .empty {
    padding: 16px;
    border: 1px dashed rgba(255,255,255,0.18);
    border-radius: 10px;
    color: rgba(232,238,248,0.58);
    font-size: 13px;
  }
</style>
