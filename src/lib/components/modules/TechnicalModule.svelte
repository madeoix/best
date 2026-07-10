<script>
  import { runBeaconAction } from '$lib/beacon/api.js';

  import { Button } from '$lib/components/ui/button/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';

  export let eyebrow = '';
  export let title = '';
  export let placeholder = '';
  export let actions = [];

  let output = '';
  let running = '';

  async function run(action) {
    running = action;
    output = `$ beacon ${action}\n\nrunning…`;

    try {
      const data = await runBeaconAction(action);
      output = data.message || data.error || JSON.stringify(data, null, 2);
    } catch (err) {
      output = err?.message || 'Action failed.';
    }

    running = '';
  }
</script>

<section class="module workspace-module technical-workspace">
  <header class="workspace-module-header">
    <div>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>Operational tools, probes, and raw technical output.</span>
    </div>

    <div class="workspace-status-card">
      <Badge variant="secondary">Technical</Badge>
      <span>Actions run against real local/VPS bridges only.</span>
    </div>
  </header>

  <section class="technical-workspace-grid">
    <aside class="technical-action-panel">
      <p>Actions</p>

      <div class="technical-actions">
        {#each actions as action}
          <Button
            variant="outline"
            disabled={!!running}
            on:click={() => run(action.id)}
          >
            {running === action.id ? 'Running…' : action.label}
          </Button>
        {/each}
      </div>
    </aside>

    <main class="technical-output-panel">
      <Tabs.Tabs value="output">
        <div class="technical-panel-head">
          <div>
            <p>Command output</p>
            <h2>Result stream</h2>
          </div>

          <Tabs.TabsList>
            <Tabs.TabsTrigger value="output">Output</Tabs.TabsTrigger>
            <Tabs.TabsTrigger value="notes">Notes</Tabs.TabsTrigger>
          </Tabs.TabsList>
        </div>

        <Tabs.TabsContent value="output">
          {#if running && !output}
            <Skeleton class="technical-skeleton" />
          {:else}
            <pre>{output || placeholder}</pre>
          {/if}
        </Tabs.TabsContent>

        <Tabs.TabsContent value="notes">
          <section class="workspace-empty-state">
            <b>No notes for this tool yet.</b>
            <span>Use this space later for decoded fields, links, and command explanations.</span>
          </section>
        </Tabs.TabsContent>
      </Tabs.Tabs>
    </main>
  </section>
</section>
