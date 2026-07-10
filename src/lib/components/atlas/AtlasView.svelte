<script>
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';
  import { atlasState } from '$lib/beacon/atlasState.js';
  import { worldStore } from '$lib/beacon/stores/worldStore.js';

  import ItemsAtlas from './ItemsAtlas.svelte';
  import SpacesAtlas from './SpacesAtlas.svelte';

  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';

  let atlasTab = 'spaces';

  $: itemCounts = $atlasState.status?.counts || {};
  $: worldCounts = $worldStore.world?.counts || {};
</script>

<section class="module atlas-module">
  <header class="atlas-header">
    <div>
      <p>ATLAS</p>
      <h1>World browser</h1>
      <span>Spaces, items, owners, and evidence from backend Beacon contracts.</span>
    </div>

    <div class="atlas-status">
      {#if atlasTab === 'spaces' && $worldStore.world?.ok}
        <Badge variant="secondary">{fmtNumber(worldCounts.visible_spaces || 0)} visible spaces</Badge>
        <span>
          {fmtNumber(worldCounts.items || 0)} items · {fmtNumber(worldCounts.filtered_spaces || 0)} filtered
        </span>
      {:else if atlasTab === 'spaces' && $worldStore.loading}
        <Badge variant="secondary">Loading</Badge>
        <span>Reading Beacon world contract…</span>
      {:else if atlasTab === 'items' && $atlasState.status?.ok}
        <Badge variant="secondary">{fmtNumber(itemCounts.assets || 0)} assets</Badge>
        <span>{fmtNumber(itemCounts.observations || 0)} observations · synced {fmtDate($atlasState.status.generated_at)}</span>
      {:else}
        <Badge variant="secondary">Beacon</Badge>
        <span>Backend contracts render here without frontend merging.</span>
      {/if}
    </div>
  </header>

  <Tabs.Tabs bind:value={atlasTab} class="atlas-mode-tabs-shadcn">
    <Tabs.TabsList>
      <Tabs.TabsTrigger value="spaces">Spaces</Tabs.TabsTrigger>
      <Tabs.TabsTrigger value="items">Items</Tabs.TabsTrigger>
    </Tabs.TabsList>

    <Tabs.TabsContent value="spaces">
      <SpacesAtlas />
    </Tabs.TabsContent>

    <Tabs.TabsContent value="items">
      <ItemsAtlas />
    </Tabs.TabsContent>
  </Tabs.Tabs>
</section>
