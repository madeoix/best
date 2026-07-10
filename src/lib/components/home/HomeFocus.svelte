<script>
  import BeaconItemPreview from './BeaconItemPreview.svelte';

  export let item = null;
  export let selected = null;
  export let onOpen = () => {};

  $: activeItem = item || selected;
</script>

<BeaconItemPreview item={activeItem} {onOpen} />
