<script>
  import ItemProfile from '$lib/components/item/ItemProfile.svelte';

  export let item = null;
  export let record = null;
  export let detail = null;
  export let selected = null;
  export let sourceXml = '';

  $: source =
    sourceXml ||
    item?.source_xml ||
    item?.xml ||
    item?.source ||
    record?.source_xml ||
    record?.xml ||
    record?.source ||
    detail?.summary?.source_xml ||
    detail?.item?.source_xml ||
    detail?.item?.xml ||
    selected?.source_xml ||
    selected?.xml ||
    selected?.source ||
    '';

  $: profileItem =
    item ||
    record ||
    detail?.item ||
    selected ||
    (source ? { source_xml: source } : null);
</script>

<section class="observatory-record profile-record">
  <ItemProfile item={profileItem} sourceXml={source} />
</section>
