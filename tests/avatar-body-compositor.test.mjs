import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getForwardIdleRig,
  getSpriteFrame
} from '../src/lib/avatar-renderer/bodySpriteCompositor.js';

test('forward idle rig builds a female sprite stack and calibrated head slot', () => {
  const rig = getForwardIdleRig({
    gender: 'female',
    selectedOptions: {
      GenderOptions: 'Female',
      SkinColorOptions: 'SkinColorTan',
      TopColorOptions: 'White',
      BottomColorOptions: 'Black'
    }
  });

  assert.equal(rig.gender, 'female');
  assert.deepEqual(rig.canvas, { width: 128, height: 256 });
  assert.equal(rig.layers.length, 12);
  assert.match(rig.layers.find((layer) => layer.id === 'torso').url, /female\/tshirt_torso\.png$/);
  assert.ok(rig.head.width > 70);
  assert.ok(rig.head.y < 40);
});

test('forward idle rig switches torso and head calibration for male avatars', () => {
  const rig = getForwardIdleRig({
    selectedOptions: {
      GenderOptions: 'Male',
      SkinColorOptions: 'SkinColorPink'
    }
  });

  assert.equal(rig.gender, 'male');
  assert.match(rig.layers.find((layer) => layer.id === 'torso').url, /male\/tshirt_torso\.png$/);
  assert.equal(rig.colors.skin, '#efb198');
  assert.notDeepEqual(rig.head, getForwardIdleRig({ gender: 'female' }).head);
});

test('sprite frame calculation extracts the requested cell', () => {
  const frame = getSpriteFrame(
    { width: 140, height: 184 },
    { cols: 4, rows: 2, col: 2, row: 1 }
  );

  assert.deepEqual(frame, {
    sx: 70,
    sy: 92,
    width: 35,
    height: 92
  });
});
