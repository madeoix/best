import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pythonSource = readFileSync(
  new URL('../tools/bootstrap_avatar_calibration_contract.py', import.meta.url),
  'utf8'
);

const shellSource = readFileSync(
  new URL('../tools/bootstrap_avatar_calibration_contract.sh', import.meta.url),
  'utf8'
);

test('calibration contract bootstrap is syntax valid and session independent', () => {
  const result = spawnSync(
    'python3',
    ['-m', 'py_compile', 'tools/bootstrap_avatar_calibration_contract.py'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(pythonSource, /avatars\/designs\/avatar_design\.xml/);
  assert.match(pythonSource, /build_avatar_render_contract_v4\.py/);
  assert.match(pythonSource, /build_avatar_head_design_sprites\.py/);
  assert.doesNotMatch(pythonSource, /gateway-captures/);
  assert.doesNotMatch(pythonSource, /gateway-request-/);
  assert.doesNotMatch(pythonSource, /smallverse_amf/);
});

test('shell wrapper requires an explicit avatar id', () => {
  assert.match(shellSource, /usage: \$0 <avatar-id>/);
  assert.match(shellSource, /--avatar-id "\$AVATAR_ID"/);
});
