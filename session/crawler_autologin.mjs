#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith('--') && value !== undefined) args.set(key.slice(2), value);
}

const profile = String(args.get('profile') || '').trim();
const port = Number(args.get('port') || 0);
const timeoutSeconds = Math.max(10, Number(args.get('timeout') || 120));
const credentialsFile = String(args.get('credentials-file') || '').trim();
const cookieFile = String(args.get('cookie-file') || '').trim();
const submitLogin = String(args.get('submit') || 'true').trim().toLowerCase() !== 'false';

if (!['crawler-01', 'crawler-02'].includes(profile)) {
  console.error('[autologin] invalid crawler profile');
  process.exit(2);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('[autologin] invalid debugging port');
  process.exit(2);
}

function readCredential() {
  if (credentialsFile) {
    let document;
    try {
      document = JSON.parse(readFileSync(credentialsFile, 'utf8'));
    } catch {
      throw new Error('The VPS crawler credential store is unavailable.');
    }

    const entry = document?.[profile];
    const email = String(entry?.email || '').trim();
    const password = String(entry?.password || '');
    if (!email || !password) {
      throw new Error(`The VPS crawler credential entry for ${profile} is incomplete.`);
    }
    return { email, password };
  }

  const result = spawnSync(
    'secret-tool',
    [
      'lookup',
      'application', 'smallverse-beacon',
      'kind', 'crawler-login',
      'profile', profile
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

  if (result.error) {
    throw new Error('GNOME Keyring helper is unavailable.');
  }
  if (result.status !== 0 || !String(result.stdout || '').trim()) {
    throw new Error(`No encrypted login is stored for ${profile}.`);
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout).trim());
  } catch {
    throw new Error(`The encrypted login entry for ${profile} is invalid.`);
  }

  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  if (!email || !password) {
    throw new Error(`The encrypted login entry for ${profile} is incomplete.`);
  }

  return { email, password };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1500)
  });
  if (!response.ok) throw new Error(`debug endpoint returned HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.counter = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 3000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP connection failed'));
      }, { once: true });
    });

    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message?.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
      else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP socket is not open'));
    }
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 5000);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Best effort only.
    }
  }
}

const fillFunction = `function(email, password, shouldSubmit) {
  const visible = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
  };
  const normalized = (value) => String(value || '').toLowerCase();
  const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
  const passwordInput = inputs.find((input) => normalized(input.type) === 'password');
  const emailInput = inputs.find((input) => {
    const haystack = [input.type, input.name, input.id, input.autocomplete, input.placeholder, input.getAttribute('aria-label')]
      .map(normalized)
      .join(' ');
    return input !== passwordInput && (haystack.includes('email') || haystack.includes('username') || haystack.includes('login'));
  }) || inputs.find((input) => input !== passwordInput && ['text', 'email', ''].includes(normalized(input.type)));

  if (!passwordInput || !emailInput) {
    return { found: false, title: document.title, href: location.href };
  }

  const setValue = (input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setValue(emailInput, email);
  setValue(passwordInput, password);

  let submitted = false;
  if (shouldSubmit) {
    const form = passwordInput.form || emailInput.form;
    if (form?.requestSubmit) {
      form.requestSubmit();
      submitted = true;
    } else {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).filter(visible);
      const button = buttons.find((candidate) => {
        const text = normalized(candidate.innerText || candidate.value || candidate.getAttribute('aria-label'));
        return candidate.type === 'submit' || text.includes('log in') || text.includes('login') || text.includes('sign in');
      });
      if (button) {
        button.click();
        submitted = true;
      }
    }
  }

  return { found: true, submitted, title: document.title, href: location.href };
}`;

async function tryTarget(target, credential) {
  if (!target?.webSocketDebuggerUrl) return false;
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect();
    await client.send('Runtime.enable');
    const expression = `(${fillFunction})(${JSON.stringify(credential.email)}, ${JSON.stringify(credential.password)}, ${JSON.stringify(submitLogin)})`;
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    const value = result?.result?.value || {};
    if (value.found) {
      console.log(
        submitLogin
          ? `[autologin] submitted login form for ${profile}`
          : `[autologin] filled login form for ${profile}; waiting for human verification`
      );
      return true;
    }
  } catch {
    // Targets can disappear while Electron navigates. Retry against the next list.
  } finally {
    client.close();
  }
  return false;
}

async function cookiePair(target) {
  if (!target?.webSocketDebuggerUrl) return null;
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect();
    const result = await client.send('Network.getAllCookies');
    const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
    const values = new Map(
      cookies
        .filter((cookie) => /(^|\.)smallverse\.app$/i.test(String(cookie?.domain || '')))
        .map((cookie) => [String(cookie.name || ''), String(cookie.value || '')])
    );
    const jsessionid = values.get('JSESSIONID');
    const swsid = values.get('SWSID');
    return jsessionid && swsid ? `JSESSIONID=${jsessionid}; SWSID=${swsid}` : null;
  } catch {
    return null;
  } finally {
    client.close();
  }
}

function targetUrl(target) {
  try {
    return new URL(String(target?.url || ''));
  } catch {
    return null;
  }
}

function isAuthenticatedTarget(target) {
  const url = targetUrl(target);
  return Boolean(
    url &&
    url.protocol === 'https:' &&
    url.hostname === 'www.smallverse.app' &&
    (url.pathname === '/profile' || url.pathname.startsWith('/space/'))
  );
}

function isWorldTarget(target) {
  const url = targetUrl(target);
  return Boolean(
    url &&
    url.protocol === 'https:' &&
    url.hostname === 'www.smallverse.app' &&
    url.pathname.startsWith('/space/')
  );
}

// A successful website login only creates SWSID. Smallverse issues the
// gateway JSESSIONID when the selected avatar actually enters a world. The
// crawler renewal therefore has to follow the same profile -> destination ->
// ENTER WORLD sequence as the real client after the human solves reCAPTCHA.
// This does not accept terms or choose a hidden option on the user's behalf;
// it only selects the first destination already presented by Smallverse.
async function enterWorldTarget(target) {
  if (!target?.webSocketDebuggerUrl) return { found: false, clicked: false };
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect();
    await client.send('Runtime.enable');
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const card = document.querySelector('.destination-card.active')
          || document.querySelector('.destination-card');
        const button = document.getElementById('enter-world-btn');
        if (!card || !button) return { found: false, clicked: false };
        if (!card.classList.contains('active')) card.click();
        if (button.disabled) {
          return { found: true, clicked: false, disabled: true };
        }
        button.click();
        return { found: true, clicked: true, disabled: false };
      })()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    return result?.result?.value || { found: false, clicked: false };
  } catch {
    return { found: false, clicked: false };
  } finally {
    client.close();
  }
}

// An isolated profile can already have a valid web login while its game socket
// has not been opened yet.  In that case there is no form to submit, but the
// proxy still needs one real Smallverse navigation to observe the refreshed
// JSESSIONID/SWSID request.  Previously this path only waited and timed out.
async function wakeAuthenticatedTarget(target) {
  if (!target?.webSocketDebuggerUrl) return false;
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect();
    await client.send('Page.enable');
    await client.send('Page.navigate', { url: 'https://www.smallverse.app/' });
    console.log(`[autologin] opened Smallverse for existing ${profile} session`);
    return true;
  } catch {
    return false;
  } finally {
    client.close();
  }
}

async function main() {
  const credential = readCredential();
  const deadline = Date.now() + timeoutSeconds * 1000;
  let submitted = false;
  let wokeAuthenticatedSession = false;
  let worldEntryStarted = false;
  let observedAuthenticatedSession = false;
  let baselineCaptured = !cookieFile;
  let baselineCookie = null;

  while (Date.now() < deadline) {
    let targets = [];
    try {
      targets = await fetchTargets();
    } catch {
      await sleep(500);
      continue;
    }

    // Human-login mode can start with an expired cookie pair still present in
    // the persistent Chromium profile. Record it before filling the form so
    // only a genuinely new pair issued after human verification is exported.
    if (!baselineCaptured) {
      for (const target of targets) {
        const type = String(target?.type || '').toLowerCase();
        if (!['page', 'webview', 'background_page'].includes(type)) continue;
        baselineCookie = await cookiePair(target);
        if (baselineCookie) break;
      }
      baselineCaptured = true;
      console.log(`[autologin] recorded existing session baseline for ${profile}`);
    }

    // Once submitted, give the app time to complete its navigation. Replaying a
    // password submission on every CDP poll can cancel an in-flight sign-in.
    if (!submitted) {
      for (const target of targets) {
        const type = String(target?.type || '').toLowerCase();
        if (!['page', 'webview', 'background_page'].includes(type)) continue;
        if (await tryTarget(target, credential)) {
          submitted = true;
          break;
        }
      }
    }

    if (submitLogin && !submitted && !wokeAuthenticatedSession) {
      for (const target of targets) {
        const type = String(target?.type || '').toLowerCase();
        if (!['page', 'webview', 'background_page'].includes(type)) continue;
        if (await wakeAuthenticatedTarget(target)) {
          wokeAuthenticatedSession = true;
          break;
        }
      }
    }

    const authenticatedTargets = targets.filter(isAuthenticatedTarget);
    if (authenticatedTargets.length) observedAuthenticatedSession = true;

    if (!worldEntryStarted) {
      for (const target of authenticatedTargets) {
        if (isWorldTarget(target)) {
          worldEntryStarted = true;
          break;
        }
        const entry = await enterWorldTarget(target);
        if (entry.clicked) {
          worldEntryStarted = true;
          console.log(`[autologin] entered the selected Smallverse world for ${profile}`);
          break;
        }
      }
    }

    if (cookieFile && (submitted || observedAuthenticatedSession)) {
      const worldIsActive = targets.some(isWorldTarget);
      for (const target of targets) {
        const cookie = await cookiePair(target);
        // An already-open world proves that its current gateway pair is live,
        // even when it matches the cookie present when this helper attached.
        // On a login/profile page, however, keep rejecting the stale baseline.
        if (!cookie || (cookie === baselineCookie && !worldIsActive)) continue;
        writeFileSync(cookieFile, `${cookie}\n`, { encoding: 'utf8', mode: 0o600 });
        console.log(`[autologin] refreshed session captured for ${profile}`);
        return;
      }
    }

    if (submitted && !cookieFile) return;
    await sleep(750);
  }

  if (observedAuthenticatedSession) {
    console.log(`[autologin] ${profile} authenticated, but no gateway session was issued`);
  } else if (submitted) {
    console.log(`[autologin] login was submitted for ${profile}, but no fresh session cookies were issued`);
  } else {
    console.log(`[autologin] no login form appeared for ${profile}; the isolated profile may already be authenticated`);
  }
}

main().catch((error) => {
  console.error(`[autologin] ${error.message}`);
  process.exit(1);
});
