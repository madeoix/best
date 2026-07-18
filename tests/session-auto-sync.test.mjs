import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const addon = readFileSync('session/auto_jsessionid.py', 'utf8');
const launcher = readFileSync('session/grab-session.sh', 'utf8');
const autologin = readFileSync('session/crawler_autologin.mjs', 'utf8');
const renewal = readFileSync('session/crawler-session-renew.sh', 'utf8');
const humanLogin = readFileSync('session/crawler-human-login.sh', 'utf8');
const vpsHumanLogin = readFileSync('session/crawler-vps-human-login.sh', 'utf8');
const remoteHumanLogin = readFileSync('session/vps-crawler-human-login.sh', 'utf8');
const cookieImporter = readFileSync('session/import-session-cookie.py', 'utf8');
const desktop = readFileSync('src-tauri/src/desktop.rs', 'utf8');
const controls = readFileSync(
  'src/lib/components/shell/SessionControls.svelte',
  'utf8'
);
const dialog = readFileSync(
  'src/lib/components/shell/CrawlerCredentialsDialog.svelte',
  'utf8'
);
const observatory = readFileSync('src/routes/ops/+page.svelte', 'utf8');


test('crawler captures target the dual-crawler workspace', () => {
  assert.match(addon, /\/opt\/smallverse-staging-dual\/workspace/);
  assert.match(addon, /workspace_for_role\(role\)/);
});

test('session secrets travel through stdin rather than argv', () => {
  assert.match(addon, /input=cookie/);
  assert.match(addon, /cat > "\$tmp"/);
  assert.doesNotMatch(addon, /--cookie\s+\{?cookie/i);
  assert.doesNotMatch(launcher, /echo\s+.*(?:JSESSIONID|SWSID)/i);
});

test('the addon observes request and response refresh paths', () => {
  assert.match(addon, /def request\(/);
  assert.match(addon, /request-cookie/);
  assert.match(addon, /def response\(/);
  assert.match(addon, /response-set-cookie/);
});

test('crawler credentials are kept off command lines and provisioned to casa over stdin', () => {
  assert.match(desktop, /Command::new\("secret-tool"\)/);
  assert.match(desktop, /"store"/);
  assert.match(desktop, /"lookup"/);
  assert.match(desktop, /stdin\(Stdio::piped\(\)\)/);
  assert.match(desktop, /smallverse-crawler-login\/v1/);
  assert.match(desktop, /provision_crawler_credential_on_vps/);
  assert.match(desktop, /Command::new\("ssh"\)/);
  assert.match(desktop, /write_all\(&payload\)/);
  assert.doesNotMatch(desktop, /arg\([^\n]*password/i);
  assert.doesNotMatch(launcher, /SMALLVERSE_(?:EMAIL|PASSWORD)/);
  assert.doesNotMatch(autologin, /console\.(?:log|error)\([^\n]*(?:email|password)/i);
});

test('automatic renewal uses isolated Smallverse profiles', () => {
  assert.match(launcher, /--user-data-dir=/);
  assert.match(launcher, /--in-process-gpu/);
  assert.match(launcher, /--disable-gpu-sandbox/);
  assert.doesNotMatch(launcher, /profile_flags\+=\([^\n]*--disable-software-rasterizer/);
  assert.match(launcher, /--remote-debugging-port=/);
  assert.match(launcher, /crawler_autologin\.mjs/);
  assert.match(renewal, /SMALLVERSE_ISOLATED_PROFILE=1/);
  assert.match(renewal, /SMALLVERSE_AUTO_LOGIN=1/);
  assert.match(renewal, /SMALLVERSE_HUMAN_LOGIN/);
  assert.match(renewal, /SMALLVERSE_CLOSE_AFTER_SYNC=1/);
  assert.match(launcher, /env -u ELECTRON_RUN_AS_NODE/);
});

test('human verification avoids the capture proxy and imports CDP cookies securely', () => {
  assert.match(renewal, /crawler-vps-human-login\.sh/);
  assert.match(vpsHumanLogin, /127\.0\.0\.1:\$LOCAL_PORT:127\.0\.0\.1:\$REMOTE_WEB_PORT/);
  assert.match(vpsHumanLogin, /private SSH tunnel/);
  assert.match(remoteHumanLogin, /--submit false/);
  assert.match(remoteHumanLogin, /--cookie-file/);
  assert.match(remoteHumanLogin, /import-session-cookie\.py/);
  assert.match(remoteHumanLogin, /SMALLVERSE_DIRECT_IMPORT=1/);
  assert.match(remoteHumanLogin, /SMALLVERSE_HUMAN_LOGIN_TIMEOUT:-1800/);
  assert.match(remoteHumanLogin, /-listen 127\.0\.0\.1/);
  assert.doesNotMatch(remoteHumanLogin, /0\.0\.0\.0/);
  assert.match(cookieImporter, /canonical_cookie/);
  assert.match(cookieImporter, /human-login-cdp/);
});

test('the desktop exposes enrollment without making crawlers personal accounts', () => {
  assert.match(desktop, /desktop_crawler_credentials/);
  assert.match(desktop, /desktop_crawler_credential_action/);
  assert.match(controls, /Open operator Observatory/);
  assert.doesNotMatch(controls, /switchSession\(['"]crawler-0[12]/);
  assert.match(observatory, /Manage crawler logins/);
  assert.match(observatory, /CrawlerCredentialsDialog/);
  assert.match(dialog, /GNOME Keyring \/ Secret Service/);
  assert.match(dialog, /Renew both crawlers/);
  assert.match(desktop, /launch_crawler_human_login/);
  assert.match(desktop, /"human-login"/);
  assert.match(desktop, /SMALLVERSE_AUTO_LOGIN_TIMEOUT", "1800"/);
  assert.match(desktop, /SMALLVERSE_HUMAN_LOGIN_TIMEOUT", "1800"/);
  assert.match(desktop, /SMALLVERSE_HUMAN_LOGIN", "1"/);
  assert.match(autologin, /waiting for human verification/);
  assert.match(autologin, /enterWorldTarget/);
  assert.match(autologin, /enter-world-btn/);
  assert.match(autologin, /worldIsActive/);
  assert.match(vpsHumanLogin, /session_profile_cli/);
  assert.match(vpsHumanLogin, /secrets_exposed/);
  assert.match(vpsHumanLogin, /metadata_only/);
  assert.match(dialog, /Open VPS login \/ solve reCAPTCHA/);
});

test('session dropdown actions reach the Svelte 5 menu-item wrapper', () => {
  assert.match(controls, /DropdownMenuItem onclick=/);
  assert.doesNotMatch(controls, /DropdownMenuItem on:click=/);
});

test('crawler credential actions reach the Svelte 5 button wrapper', () => {
  assert.match(dialog, /onclick=\{\(\) => save\(profile\.profile\)\}/);
  assert.match(dialog, /onclick=\{renewBoth\}/);
  assert.doesNotMatch(dialog, /on:click=/);
});
