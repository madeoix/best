import assert from 'node:assert/strict';
import test from 'node:test';

const bridge = await import('../src/lib/runtime/desktopBridge.js');

test('desktop bridge rejects commands in a normal browser runtime', async () => {
  delete globalThis.__TAURI__;

  assert.equal(bridge.isDesktopRuntime(), false);

  await assert.rejects(
    () => bridge.getDesktopSessions(),
    (error) => error?.code === 'DESKTOP_REQUIRED'
  );
});

test('desktop bridge invokes only named Tauri commands', async () => {
  const calls = [];

  globalThis.__TAURI__ = {
    core: {
      async invoke(command, payload) {
        calls.push({ command, payload });
        return { ok: true };
      }
    }
  };

  assert.equal(bridge.isDesktopRuntime(), true);

  await bridge.runDesktopSessionAction('switch', { id: 'maddie' });
  await bridge.runDesktopOperatorAction('disk', 'Inspect disk use');
  await bridge.launchDesktopTool('logs');

  assert.deepEqual(calls, [
    {
      command: 'desktop_session_action',
      payload: {
        action: 'switch',
        payload: { id: 'maddie' }
      }
    },
    {
      command: 'desktop_operator_action',
      payload: {
        action: 'disk',
        reason: 'Inspect disk use'
      }
    },
    {
      command: 'desktop_launch_tool',
      payload: { tool: 'logs' }
    }
  ]);

  delete globalThis.__TAURI__;
});
