import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  compileAvatarSpriteXml,
  SMALLWORLDS_DEFAULT_FRAME_DURATION,
  SMALLWORLDS_DEFAULT_FRAMERATE
} from '../src/lib/avatar-renderer/avatarSpriteXmlCompiler.js';
import {
  buildAvatarAnimationFramePlan,
  resolveAvatarLayerView
} from '../src/lib/avatar-renderer/avatarAnimationPlanner.js';

const avatarXml = await readFile(
  new URL('../static/avatar-assets/avatars/body/base/unisex/avatar.xml', import.meta.url),
  'utf8'
);
const model = compileAvatarSpriteXml(avatarXml);

function nodeFrames(plan, nodeId) {
  return plan.frames.map((frame) => frame.nodes.find((node) => node.id === nodeId)?.frameId);
}

test('real avatar.xml compiles into the recovered SpriteItem model', () => {
  assert.equal(model.id, '0');
  assert.equal(model.name, 'Avatar');
  assert.deepEqual(model.defaults, {
    framerate: SMALLWORLDS_DEFAULT_FRAMERATE,
    frameDuration: SMALLWORLDS_DEFAULT_FRAME_DURATION
  });
  assert.deepEqual(model.stats, {
    textures: 46,
    nodes: 31,
    nodeLayers: 88,
    nodeViews: 628,
    nodeFrames: 80,
    nodeAnimations: 20,
    globalAnimations: 186,
    globalFrames: 752
  });
  assert.deepEqual(model.diagnostics, []);

  assert.deepEqual(
    {
      source: model.texturesById.Head.source,
      cols: model.texturesById.Head.cols,
      rows: model.texturesById.Head.rows
    },
    {
      source: 'avatars/body/base/unisex/head.png',
      cols: 4,
      rows: 2
    }
  );
});

test('angle-specific views preserve authored cells, offsets, and mirror flags', () => {
  const headForward = resolveAvatarLayerView(model, 'Head', 'Forward', 0);
  assert.deepEqual(headForward, {
    angle: 0,
    authoredAngle: 0,
    col: 2,
    row: 1,
    offset: { x: 5, y: 25 },
    layerOffset: { x: 0, y: 25 },
    viewOffset: { x: 5, y: 0 },
    alpha: 1,
    flip: { horizontal: false, vertical: false }
  });

  const leftArm = resolveAvatarLayerView(model, 'LeftArm', 'Idle', 45);
  assert.equal(leftArm.col, 1);
  assert.equal(leftArm.row, 0);
  assert.deepEqual(leftArm.offset, { x: -4, y: 15 });
  assert.deepEqual(leftArm.flip, { horizontal: true, vertical: false });

  // A non-authored camera angle deterministically selects the nearest source
  // angle instead of silently changing sprite-cell conventions.
  assert.equal(resolveAvatarLayerView(model, 'Head', 'Forward', 44).authoredAngle, 45);

  assert.deepEqual(
    model.nodesById.Head.framesById.Walk1.layerRefs[0].offset,
    { x: 0, y: 1 }
  );
  assert.deepEqual(
    model.animationsById.Sit.framesById.Sit.nodeRefs.find((ref) => ref.id === 'OverFootSlot').positionOffset,
    { x: 0.45, y: 0.4, z: 0 }
  );
});

test('Idle plan resolves the complete authored forward pose at the SWF default rate', () => {
  const plan = buildAvatarAnimationFramePlan(model, 'Idle', { angle: 0 });

  assert.equal(plan.framerate, 5);
  assert.equal(plan.sourceFramerate, 5);
  assert.equal(plan.durationTicks, 1);
  assert.equal(plan.durationSeconds, 0.2);
  assert.equal(plan.nestedTimeline, false);
  assert.equal(plan.frames.length, 1);
  assert.deepEqual(nodeFrames(plan, 'Head'), ['Forward']);
  assert.deepEqual(nodeFrames(plan, 'LeftArm'), ['Idle']);
  assert.deepEqual(nodeFrames(plan, 'RightLegWhole'), ['Idle']);

  const shadow = plan.frames[0].nodes.find((node) => node.id === 'Shadow');
  assert.equal(shadow.layers[0].textureSource, 'avatars/body/base/unisex/shadow.png');
});

test('Walk plan expands the exact 3-frame head and 4-frame limb cycles', () => {
  const plan = buildAvatarAnimationFramePlan(model, 'Walk', { angle: 0 });

  assert.equal(plan.framerate, 8);
  assert.equal(plan.sourceFramerate, 5);
  assert.equal(plan.nestedTimeline, true);
  assert.equal(plan.frames.length, 12);
  assert.equal(plan.durationTicks, 12);
  assert.equal(plan.durationSeconds, 1.5);

  assert.deepEqual(nodeFrames(plan, 'Head'), [
    'Forward', 'Walk1', 'Walk2',
    'Forward', 'Walk1', 'Walk2',
    'Forward', 'Walk1', 'Walk2',
    'Forward', 'Walk1', 'Walk2'
  ]);
  assert.deepEqual(nodeFrames(plan, 'LeftArm'), [
    'Walk3', 'Walk2', 'Walk1', 'Walk2',
    'Walk3', 'Walk2', 'Walk1', 'Walk2',
    'Walk3', 'Walk2', 'Walk1', 'Walk2'
  ]);
  assert.deepEqual(nodeFrames(plan, 'RightArm'), [
    'Walk1', 'Walk2', 'Walk3', 'Walk2',
    'Walk1', 'Walk2', 'Walk3', 'Walk2',
    'Walk1', 'Walk2', 'Walk3', 'Walk2'
  ]);
  assert.deepEqual(nodeFrames(plan, 'LeftLegWhole').slice(0, 4), [
    'Walk3', 'Walk4', 'Walk1', 'Walk2'
  ]);
  assert.deepEqual(nodeFrames(plan, 'RightLegWhole').slice(0, 4), [
    'Walk1', 'Walk2', 'Walk3', 'Walk4'
  ]);
});

test('LeftArmWave and RightArmWave retain their recovered SWF names and sides', () => {
  const left = buildAvatarAnimationFramePlan(model, 'LeftArmWave');
  const right = buildAvatarAnimationFramePlan(model, 'RightArmWave');

  assert.equal(left.framerate, 5);
  assert.equal(right.framerate, 5);
  assert.deepEqual(left.frames.map((frame) => frame.id), ['Wave1', 'Wave2']);
  assert.deepEqual(right.frames.map((frame) => frame.id), ['Wave1', 'Wave2']);
  assert.deepEqual(nodeFrames(left, 'LeftArm'), ['ArmRaiseWave1', 'ArmRaiseWave2']);
  assert.deepEqual(nodeFrames(left, 'RightArm'), ['Idle', 'Idle']);
  assert.deepEqual(nodeFrames(right, 'LeftArm'), ['Idle', 'Idle']);
  assert.deepEqual(nodeFrames(right, 'RightArm'), ['ArmRaiseWave1', 'ArmRaiseWave2']);

  const leftWaveLayers = left.frames[0].nodes.find((node) => node.id === 'LeftArm').layers;
  assert.deepEqual(leftWaveLayers.map((layer) => layer.textureId), [
    'ArmRaise',
    'ArmRaiseWave1'
  ]);
});

test('explicit framerates and multi-tick frame durations are compiled faithfully', () => {
  const animation = model.animationsById.RightArmThrowOut;

  assert.equal(animation.explicitFramerate, true);
  assert.equal(animation.framerate, 10);
  assert.deepEqual(animation.frames.map((frame) => frame.duration), [5, 2, 1, 2, 3]);
  assert.equal(animation.durationTicks, 13);
  assert.equal(animation.durationSeconds, 1.3);

  const turningFrame = model.animationsById.Dancing.framesById['Skip 02'];
  assert.equal(turningFrame.duration, 2);
  assert.equal(turningFrame.angleOffset, 90);
});
