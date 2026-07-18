<script>
  import EmptyModule from '$lib/components/modules/EmptyModule.svelte';
</script>

<svelte:head>
  <title>Receipts · Smallverse Beacon</title>
</svelte:head>

<EmptyModule
  eyebrow="RECEIPTS"
  title="Transaction receipts"
  message="No verified receipt archive yet."
  detail="Captured transaction evidence will appear here without being mixed into crawler observations."
  binder={true}
/>

