<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fmtDate } from '$lib/beacon/format.js';
  import {
    getDesktopCrawlerCredentials,
    runDesktopCrawlerCredentialAction
  } from '$lib/runtime/desktopBridge.js';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  export let open = false;

  const dispatch = createEventDispatcher();
  const email = {
    'crawler-01': '',
    'crawler-02': ''
  };
  const password = {
    'crawler-01': '',
    'crawler-02': ''
  };

  let panel = null;
  let message = '';
  let busy = '';
  let wasOpen = false;
  let timer = null;

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(() => {
      if (open && !busy) loadPanel({ quiet: true });
    }, 3000);
  }

  async function loadPanel({ quiet = false } = {}) {
    if (!quiet) message = '';
    try {
      panel = await getDesktopCrawlerCredentials();
    } catch (error) {
      message = error?.message || 'Could not read crawler credential status.';
    }
  }

  async function run(action, payload = {}, label = action) {
    if (busy) return;
    busy = label;
    message = 'working…';
    try {
      const result = await runDesktopCrawlerCredentialAction(action, payload);
      message = result?.message || 'Done.';
      if (action === 'store') password[payload.profile] = '';
      await loadPanel({ quiet: true });
      dispatch('updated');
    } catch (error) {
      message = error?.message || 'Crawler account action failed.';
    } finally {
      busy = '';
    }
  }

  function save(profile) {
    run('store', {
      profile,
      email: email[profile],
      password: password[profile]
    }, `store:${profile}`);
  }

  function remove(profile) {
    if (!confirm(`Remove the encrypted login for ${profile} from GNOME Keyring?`)) return;
    run('delete', { profile }, `delete:${profile}`);
  }

  function renew(profile) {
    run('renew', { profile }, `renew:${profile}`);
  }

  function humanLogin(profile) {
    run('human-login', { profile }, `human-login:${profile}`);
  }

  function renewBoth() {
    run('renew-both', {}, 'renew-both');
  }

  function control(profile, action) {
    run(action, { profile }, `${action}:${profile}`);
  }

  $: if (open && !wasOpen) {
    wasOpen = true;
    loadPanel();
    startPolling();
  }

  $: if (!open && wasOpen) {
    wasOpen = false;
    stopPolling();
  }

  onDestroy(stopPolling);
</script>

<Dialog.Dialog bind:open>
  <Dialog.DialogContent class="crawler-login-dialog" showCloseButton={true}>
    <Dialog.DialogHeader>
      <Dialog.DialogTitle>Crawler account renewal</Dialog.DialogTitle>
      <Dialog.DialogDescription>
        Login details are encrypted in GNOME Keyring, then securely provisioned to
        casa only for the two dedicated crawler accounts. Your personal session is never used.
      </Dialog.DialogDescription>
    </Dialog.DialogHeader>

    {#if panel && !panel.keyringAvailable}
      <div class="crawler-warning">
        Secret Service is present, but <code>secret-tool</code> is missing. Install
        <code>libsecret-tools</code> once before saving credentials.
      </div>
    {/if}

    <div class="crawler-grid">
      {#each panel?.profiles || [] as profile}
        <section class="crawler-account">
          <header>
            <div>
              <b>{profile.profile}</b>
              <small>
                {profile.stored
                  ? `encrypted login stored${profile.emailHint ? ` · ${profile.emailHint}` : ''}`
                  : 'no encrypted login stored'}
              </small>
            </div>
            <span class:ready={profile.sessionReady} class="crawler-state">
              {profile.sessionReady ? 'session ready' : 'session needs renewal'}
            </span>
          </header>

          <div class="crawler-meta">
            <span>generation {profile.sessionGeneration || 0}</span>
            {#if profile.capturedAt}
              <span>captured {fmtDate(profile.capturedAt)}</span>
            {/if}
            {#if profile.renewalState && profile.renewalState !== 'idle'}
              <span class={`renewal-${profile.renewalState}`}>
                {profile.renewalState}
              </span>
            {/if}
          </div>

          {#if profile.renewalMessage}
            <p class="renewal-message">{profile.renewalMessage}</p>
          {/if}

          <label>
            <span>Email</span>
            <Input
              type="email"
              autocomplete="off"
              placeholder={profile.stored ? 'Enter to replace saved login' : 'crawler email'}
              bind:value={email[profile.profile]}
              disabled={!!busy}
            />
          </label>

          <label>
            <span>Password</span>
            <Input
              type="password"
              autocomplete="new-password"
              placeholder={profile.stored ? 'Enter to replace saved login' : 'crawler password'}
              bind:value={password[profile.profile]}
              disabled={!!busy}
            />
          </label>

          <div class="crawler-actions">
            <Button
              onclick={() => save(profile.profile)}
              disabled={
                !!busy ||
                !panel?.keyringAvailable ||
                !email[profile.profile]?.trim() ||
                !password[profile.profile]
              }
            >
              {profile.stored ? 'Replace encrypted login' : 'Save encrypted login'}
            </Button>

            <Button
              variant="outline"
              onclick={() => renew(profile.profile)}
              disabled={!!busy || !profile.stored}
            >
              Renew session now
            </Button>

            <Button
              variant="outline"
              onclick={() => control(profile.profile, 'run-now')}
              disabled={!!busy || !profile.sessionReady}
            >
              Capture now
            </Button>

            {#if profile.collectorActive === 'active'}
              <Button
                variant="ghost"
                onclick={() => control(profile.profile, 'pause')}
                disabled={!!busy}
              >Pause schedule</Button>
            {:else}
              <Button
                variant="outline"
                onclick={() => control(profile.profile, 'resume')}
                disabled={!!busy || !profile.sessionReady}
              >Resume schedule</Button>
            {/if}

            <Button
              variant="secondary"
              onclick={() => humanLogin(profile.profile)}
              disabled={!!busy || !profile.stored}
            >
                    Open VPS login / solve reCAPTCHA
            </Button>

            {#if profile.stored}
              <Button
                variant="ghost"
                onclick={() => remove(profile.profile)}
                disabled={!!busy}
              >
                Remove login
              </Button>
            {/if}
          </div>
        </section>
      {/each}
    </div>

    <Dialog.DialogFooter class="crawler-footer">
      <div class="crawler-footer-copy">
        <b>{panel?.backend || 'GNOME Keyring / Secret Service'}</b>
        <small>
          Each crawler launches with its own isolated Smallverse data directory.
          Your personal Smallverse session is never opened or replaced.
        </small>
      </div>
      <Button
        variant="secondary"
        onclick={renewBoth}
        disabled={
          !!busy ||
          !panel?.profiles?.length ||
          panel.profiles.some((profile) => !profile.stored)
        }
      >
        Renew both crawlers
      </Button>
    </Dialog.DialogFooter>

    {#if message}
      <div class="crawler-message">{message}</div>
    {/if}
  </Dialog.DialogContent>
</Dialog.Dialog>

<style>
  :global(.crawler-login-dialog) {
    width: min(760px, calc(100vw - 2rem));
    max-width: 760px;
    max-height: min(850px, calc(100vh - 2rem));
    overflow: auto;
    padding: 1.25rem;
  }

  .crawler-warning,
  .crawler-message {
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.6rem;
    padding: 0.7rem 0.8rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }

  .crawler-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .crawler-account {
    display: grid;
    gap: 0.7rem;
    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
    border-radius: 0.75rem;
    padding: 0.85rem;
    background: color-mix(in srgb, currentColor 3%, transparent);
  }

  .crawler-account header,
  .crawler-footer,
  .crawler-actions,
  .crawler-meta {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .crawler-account header,
  .crawler-footer {
    justify-content: space-between;
  }

  .crawler-account header > div,
  .crawler-footer-copy,
  label {
    display: grid;
    gap: 0.15rem;
  }

  small,
  label > span,
  .crawler-meta,
  .renewal-message {
    color: var(--muted-foreground);
    font-size: 0.72rem;
  }

  .crawler-state {
    border-radius: 999px;
    padding: 0.2rem 0.45rem;
    background: color-mix(in srgb, #d97706 14%, transparent);
    color: #d97706;
    white-space: nowrap;
    font-size: 0.68rem;
  }

  .crawler-state.ready,
  .renewal-synced {
    color: #16a34a;
  }

  .renewal-failed {
    color: #dc2626;
  }

  .renewal-running,
  .renewal-starting {
    color: #d97706;
  }

  .crawler-actions {
    flex-wrap: wrap;
  }

  .crawler-footer-copy {
    max-width: 32rem;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  @media (max-width: 680px) {
    .crawler-grid {
      grid-template-columns: 1fr;
    }

    .crawler-footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
