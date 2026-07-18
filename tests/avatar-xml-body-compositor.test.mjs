import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileAvatarSpriteXml } from '../src/lib/avatar-renderer/avatarSpriteXmlCompiler.js';
import {
  buildAvatarXmlBodyRig,
  SUPPORTED_AVATAR_ANGLES,
  SUPPORTED_AVATAR_ANIMATIONS
} from '../src/lib/avatar-renderer/avatarXmlBodyCompositor.js';

const xml = await readFile(
  new URL('../static/avatar-assets/avatars/body/base/unisex/avatar.xml', import.meta.url),
  'utf8'
);
const model = compileAvatarSpriteXml(xml);
const selectedOptions = {
  GenderOptions: 'Female',
  SkinColorOptions: 'SkinColorPeach',
  TopColorOptions: 'White',
  BottomColorOptions: 'Black'
};

test('renderer exposes the four verified XML states and all authored isometric angles', () => {
  assert.deepEqual(SUPPORTED_AVATAR_ANIMATIONS.map((state) => state.id), [
    'Idle',
    'Walk',
    'LeftArmWave',
    'RightArmWave'
  ]);
  assert.deepEqual(SUPPORTED_AVATAR_ANGLES, [0, 45, 90, 135, 180, 225, 270, 315]);
});

test('Idle body rig comes from the compiled XML plan and marks outfit scope honestly', () => {
  const rig = buildAvatarXmlBodyRig(model, { selectedOptions });

  assert.equal(rig.animation.id, 'Idle');
  assert.equal(rig.animation.frameId, 'Idle');
  assert.equal(rig.animation.frameCount, 1);
  assert.equal(rig.oracleComparable, true);
  assert.equal(rig.completeness.authoredAvatarXml, true);
  assert.equal(rig.completeness.equippedItemXml, false);
  assert.equal(rig.completeness.compositeTextures, 'captured-config-default-jumpsuit');
  assert.deepEqual(rig.warnings, []);

  const leftArm = rig.layers.find((layer) => (
    layer.nodeId === 'LeftArm' && layer.role === 'base-skin'
  ));
  assert.deepEqual(
    { col: leftArm.col, row: leftArm.row, flip: leftArm.flip },
    { col: 0, row: 0, flip: { horizontal: true, vertical: false } }
  );
  assert.match(leftArm.url, /arm_idle\.png$/);
  assert.ok(rig.layers.some((layer) => layer.role === 'captured-default-top'));
  assert.ok(rig.layers.some((layer) => layer.role === 'captured-default-bottom'));
  assert.ok(rig.layers.some((layer) => layer.role === 'captured-default-feet'));
  assert.ok(!rig.layers.some((layer) => layer.role.includes('placeholder')));
  assert.ok(rig.layers.some((layer) => (
    layer.nodeId === 'Head' && layer.role === 'authored-texture'
  )));
});

test('Walk uses the expanded XML timeline and swaps actual walk sprite sheets', () => {
  const first = buildAvatarXmlBodyRig(model, {
    animationId: 'Walk',
    frameIndex: 0,
    selectedOptions
  });
  const second = buildAvatarXmlBodyRig(model, {
    animationId: 'Walk',
    frameIndex: 1,
    selectedOptions
  });

  assert.equal(first.animation.frameCount, 12);
  assert.equal(first.animation.framerate, 8);
  assert.equal(first.animation.nestedTimeline, true);
  assert.equal(first.oracleComparable, false);
  assert.match(
    first.layers.find((layer) => layer.nodeId === 'LeftArm' && layer.role === 'base-skin').url,
    /arm_walk3\.png$/
  );
  assert.notEqual(first.animation.frameId, second.animation.frameId);
  assert.notDeepEqual(
    first.layers.find((layer) => layer.nodeId === 'RightArm' && layer.role === 'base-skin'),
    second.layers.find((layer) => layer.nodeId === 'RightArm' && layer.role === 'base-skin')
  );
});

test('left and right wave plans animate the authored side without swapping names', () => {
  const left = buildAvatarXmlBodyRig(model, {
    animationId: 'LeftArmWave',
    selectedOptions
  });
  const right = buildAvatarXmlBodyRig(model, {
    animationId: 'RightArmWave',
    selectedOptions
  });

  assert.ok(left.layers.some((layer) => (
    layer.nodeId === 'LeftArm' && /raise_wave1\.png$/.test(layer.url)
  )));
  assert.ok(!left.layers.some((layer) => (
    layer.nodeId === 'RightArm' && /raise_wave1\.png$/.test(layer.url)
  )));
  assert.ok(right.layers.some((layer) => (
    layer.nodeId === 'RightArm' && /raise_wave1\.png$/.test(layer.url)
  )));
});

test('non-forward angles preserve XML cells/mirroring and use the authored base head atlas', () => {
  const rig = buildAvatarXmlBodyRig(model, {
    animationId: 'Idle',
    angle: 45,
    selectedOptions
  });

  const head = rig.layers.find((layer) => layer.nodeId === 'Head');
  const leftArm = rig.layers.find((layer) => (
    layer.nodeId === 'LeftArm' && layer.role === 'base-skin'
  ));

  assert.equal(rig.head.supported, false);
  assert.equal(rig.oracleComparable, false);
  assert.match(head.url, /avatars\/body\/base\/unisex\/head\.png$/);
  assert.deepEqual(
    { col: head.col, row: head.row },
    { col: 3, row: 1 }
  );
  assert.deepEqual(leftArm.flip, { horizontal: true, vertical: false });
  assert.equal(leftArm.col, 1);
});

test('every generated renderer URL is backed by a static asset', async () => {
  for (const animation of SUPPORTED_AVATAR_ANIMATIONS) {
    const rig = buildAvatarXmlBodyRig(model, {
      animationId: animation.id,
      selectedOptions
    });

    for (const layer of rig.layers) {
      const file = new URL(`../static${layer.url}`, import.meta.url);
      await assert.doesNotReject(access(file), `${animation.id}: ${layer.url}`);
    }
  }
});
