<script>
  import SmallverseFlashRenderStage from '$lib/components/avatar/SmallverseFlashRenderStage.svelte';
  import SmallverseO3DRenderStage from '$lib/components/avatar/SmallverseO3DRenderStage.svelte';

  export let data;
  $: avatarId = data?.avatarId;
</script>

<svelte:head>
  <title>SmallVerse Flash Render Oracle</title>
</svelte:head>

<main class="page">
  <SmallverseFlashRenderStage {avatarId} />
  <SmallverseO3DRenderStage {avatarId} />
</main>

<style>
  .page {
    min-height: 100vh;
    padding: 1px 0 48px;
    background:
      radial-gradient(circle at 50% 20%, rgba(20, 120, 255, 0.18), transparent 32%),
      linear-gradient(180deg, #050914 0%, #08101f 48%, #03050a 100%);
  }
</style>
