<script>
  import { onMount } from 'svelte';
  import { fmtDate } from '$lib/beacon/format.js';
  import { getSessions, sessionAction as postSessionAction } from '$lib/beacon/api.js';

  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

  let sessionPanel = null;
  let message = '';

  async function loadSessions() {
    try {
      sessionPanel = await getSessions();
    } catch {
      sessionPanel = {
        ok: false,
        current: {
          label: 'Unknown avatar',
          ready: false
        },
        profiles: []
      };
    }
  }

  async function runSessionAction(action, payload = {}) {
    message = 'working…';

    try {
      const data = await postSessionAction(action, payload);
      message = data.message || data.error || JSON.stringify(data);
    } catch (err) {
      message = err?.message || 'Session action failed.';
    }

    await loadSessions();
  }

  async function saveCurrentSession() {
    const label = prompt('Session label / avatar name?');
    if (!label) return;

    await runSessionAction('save-current', {
      label,
      avatar_name: label
    });
  }

  async function switchSession(id) {
    if (!id) return;
    await runSessionAction('switch', { id });
  }

  onMount(loadSessions);

  $: currentSession = sessionPanel?.current;
  $: sessionName = currentSession?.label || currentSession?.avatar_name || 'Unknown avatar';
  $: sessionReady = !!currentSession?.ready;
  $: initial = sessionName?.slice(0, 1)?.toUpperCase() || '?';
  $: profiles = sessionPanel?.profiles || [];
</script>

<section class="session-menu">
  <DropdownMenu.DropdownMenu>
    <DropdownMenu.DropdownMenuTrigger class="session-trigger">
      <span class="session-avatar">{initial}</span>

      <span class="session-trigger-copy">
        <b>{sessionName}</b>
        <small>{sessionReady ? 'session ready' : 'session missing'}</small>
      </span>

      <span class="session-caret">⌄</span>
    </DropdownMenu.DropdownMenuTrigger>

    <DropdownMenu.DropdownMenuContent align="end" class="beacon-session-dropdown">
      <div class="session-dropdown-header">
        <span class="session-avatar">{initial}</span>

        <div>
          <b>{sessionName}</b>
          <small>
            {sessionReady ? 'Signed in' : 'Session missing'}
            {#if currentSession?.captured_at}
              · {fmtDate(currentSession.captured_at)}
            {/if}
          </small>
        </div>
      </div>

      <DropdownMenu.DropdownMenuSeparator />

      <DropdownMenu.DropdownMenuLabel>Switch avatar</DropdownMenu.DropdownMenuLabel>

      {#if profiles.length}
        {#each profiles as profile}
          <DropdownMenu.DropdownMenuItem on:click={() => switchSession(profile.id)}>
            {profile.label}
          </DropdownMenu.DropdownMenuItem>
        {/each}
      {:else}
        <div class="session-dropdown-empty">No saved sessions</div>
      {/if}

      <DropdownMenu.DropdownMenuSeparator />

      <DropdownMenu.DropdownMenuItem on:click={saveCurrentSession}>
        Save current session
      </DropdownMenu.DropdownMenuItem>

      <DropdownMenu.DropdownMenuItem on:click={() => runSessionAction('sync')}>
        Sync session
      </DropdownMenu.DropdownMenuItem>
    </DropdownMenu.DropdownMenuContent>
  </DropdownMenu.DropdownMenu>
</section>

{#if message}
  <aside class="toast">{message}</aside>
{/if}
