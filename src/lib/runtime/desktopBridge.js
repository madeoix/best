function tauriInvoke() {
  const invoke = globalThis?.__TAURI__?.core?.invoke;

  return typeof invoke === 'function'
    ? invoke.bind(globalThis.__TAURI__.core)
    : null;
}

export function isDesktopRuntime() {
  return tauriInvoke() !== null;
}

export async function invokeDesktop(command, payload = {}) {
  const invoke = tauriInvoke();

  if (!invoke) {
    const error = new Error(
      'This operation is available only in the Smallverse desktop application.'
    );
    error.code = 'DESKTOP_REQUIRED';
    throw error;
  }

  try {
    return await invoke(command, payload);
  } catch (error) {
    const wrapped = new Error(
      typeof error === 'string'
        ? error
        : error?.message || 'The desktop command failed.'
    );
    wrapped.code = error?.code || 'DESKTOP_COMMAND_FAILED';
    throw wrapped;
  }
}

export function getDesktopRuntimeInfo() {
  return invokeDesktop('desktop_runtime_info');
}

export function getDesktopRecentFiles() {
  return invokeDesktop('desktop_recent_files');
}

export function getDesktopSessions() {
  return invokeDesktop('desktop_sessions');
}

export function runDesktopSessionAction(action, payload = {}) {
  return invokeDesktop('desktop_session_action', {
    action,
    payload
  });
}

export function launchDesktopTool(tool) {
  return invokeDesktop('desktop_launch_tool', { tool });
}

export function runDesktopOperatorAction(action, reason) {
  return invokeDesktop('desktop_operator_action', {
    action,
    reason:
      reason ||
      `Requested ${action} from the Smallverse desktop application`
  });
}

export function getDesktopOperatorOverview() {
  return invokeDesktop('desktop_operator_overview');
}
