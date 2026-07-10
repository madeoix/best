<script>
  import { onMount } from 'svelte';
  import { getSpinPrices } from '$lib/beacon/api.js';
  import { fmtDate, fmtNumber } from '$lib/beacon/format.js';

  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';

  let prices = [];
  let loading = false;
  let error = '';
  let updatedAt = null;
  let loaded = false;

  async function loadPrices() {
    loading = true;
    error = '';

    try {
      const data = await getSpinPrices();

      if (!data.ok) {
        prices = [];
        error = data.error || 'No verified spin prices returned.';
      } else {
        prices = data.prices || [];
        updatedAt = data.generated_at || new Date().toISOString();
      }
    } catch (err) {
      prices = [];
      error = err?.message || 'Failed to load spin prices.';
    }

    loaded = true;
    loading = false;
  }

  onMount(loadPrices);
</script>

<section class="module workspace-module spin-workspace">
  <header class="workspace-module-header">
    <div>
      <p>SPIN</p>
      <h1>Wheel pricing</h1>
      <span>Live gateway-verified Spin pricing from Smallverse.</span>
    </div>

    <div class="workspace-status-card">
      <Badge variant={prices.length ? 'default' : 'secondary'}>
        {prices.length ? 'Gateway verified' : loading ? 'Checking gateway' : 'No prices'}
      </Badge>

      {#if updatedAt}
        <span>Last verified {fmtDate(updatedAt)}</span>
      {:else}
        <span>Waiting for first verified response.</span>
      {/if}
    </div>
  </header>

  <section class="spin-workspace-grid">
    <aside class="spin-orb-panel">
      <div class:live={prices.length} class="spin-orb">
        <b>{prices.length ? 'LIVE' : '—'}</b>
        <span>gateway</span>
      </div>

      <Button class="spin-refresh" on:click={loadPrices} disabled={loading}>
        {loading ? 'Checking…' : 'Refresh prices'}
      </Button>

      {#if error}
        <p class="spin-error">{error}</p>
      {:else}
        <p class="spin-hint">Prices are decoded from the live gateway response.</p>
      {/if}
    </aside>

    <main class="spin-main-panel">
      <Tabs.Tabs value="prices" class="spin-tabs">
        <div class="spin-panel-head">
          <div>
            <p>Current wheel</p>
            <h2>Verified prices</h2>
          </div>

          <Tabs.TabsList>
            <Tabs.TabsTrigger value="prices">Prices</Tabs.TabsTrigger>
            <Tabs.TabsTrigger value="rewards">Rewards</Tabs.TabsTrigger>
            <Tabs.TabsTrigger value="raw">Truth</Tabs.TabsTrigger>
          </Tabs.TabsList>
        </div>

        <Tabs.TabsContent value="prices" class="spin-tab-panel">
          {#if loading && !loaded}
            <div class="spin-price-grid">
              <Skeleton class="spin-price-skeleton" />
              <Skeleton class="spin-price-skeleton" />
              <Skeleton class="spin-price-skeleton" />
            </div>
          {:else if prices.length}
            <div class="spin-price-grid">
              {#each prices as price}
                <article class="spin-price-card">
                  <span>{price.spins} {price.spins === 1 ? 'spin' : 'spins'}</span>
                  <strong>{fmtNumber(price.price)}</strong>
                  <em>Smallverse coins</em>
                </article>
              {/each}
            </div>
          {:else}
            <section class="workspace-empty-state">
              <b>No verified prices loaded.</b>
              <span>Beacon will show prices only after the gateway returns a decoded response.</span>
            </section>
          {/if}
        </Tabs.TabsContent>

        <Tabs.TabsContent value="rewards" class="spin-tab-panel">
          <section class="workspace-empty-state">
            <b>No spin rewards captured yet.</b>
            <span>Rewards will appear after real receipt history is wired. No fake reward feed.</span>
          </section>
        </Tabs.TabsContent>

        <Tabs.TabsContent value="raw" class="spin-tab-panel">
          <dl class="workspace-description-list">
            <div>
              <dt>Gateway source</dt>
              <dd>spintowin.getSpinPrices</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{prices.length ? 'decoded prices available' : 'no decoded prices loaded'}</dd>
            </div>
            <div>
              <dt>Last verified</dt>
              <dd>{updatedAt ? fmtDate(updatedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Error</dt>
              <dd>{error || '—'}</dd>
            </div>
          </dl>
        </Tabs.TabsContent>
      </Tabs.Tabs>
    </main>
  </section>
</section>
