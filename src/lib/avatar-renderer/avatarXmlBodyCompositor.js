import { buildAvatarAnimationFramePlan } from './avatarAnimationPlanner.js';
import { resolveAvatarEquipment } from './avatarEquipmentResolver.js';
import { getAvatarBaseAppearance } from './bodySpriteCompositor.js';

export const SUPPORTED_AVATAR_ANIMATIONS = Object.freeze([
  Object.freeze({ id: 'Idle', label: 'Idle' }),
  Object.freeze({ id: 'Walk', label: 'Walk' }),
  Object.freeze({ id: 'LeftArmWave', label: 'Wave (left arm)' }),
  Object.freeze({ id: 'RightArmWave', label: 'Wave (right arm)' })
]);

export const SUPPORTED_AVATAR_ANGLES = Object.freeze([
  0,
  45,
  90,
  135,
  180,
  225,
  270,
  315
]);

// Top-left canvas anchors calibrated against the preserved forward-idle Flash
// capture. State frames and every delta away from these anchors are taken from
// the recovered avatar.xml rather than repeated by hand.
const FORWARD_IDLE_CANVAS_ANCHORS = Object.freeze({
  Head: Object.freeze({ x: 22, y: 24 }),
  Torso: Object.freeze({ x: 42, y: 88 }),
  LeftArm: Object.freeze({ x: 29, y: 96 }),
  RightArm: Object.freeze({ x: 71, y: 96 }),
  LeftLegWhole: Object.freeze({ x: 38, y: 127 }),
  RightLegWhole: Object.freeze({ x: 55, y: 127 }),
  Shadow: Object.freeze({ x: 32, y: 215 })
});

const NODE_DRAW_ORDER = Object.freeze([
  'Shadow',
  'LeftLegWhole',
  'RightLegWhole',
  'Torso',
  'LeftArm',
  'RightArm',
  'Head'
]);

// The recovered sprite sheets use 90 degrees for the front-facing cells.
// Zero degrees is the avatar's right profile, not the Flash portrait oracle.
export const FORWARD_AVATAR_ANGLE = 90;

function normalizedFrameIndex(value, frameCount) {
  if (!frameCount) return 0;
  const index = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return ((index % frameCount) + frameCount) % frameCount;
}

function assetUrl(source) {
  if (!source || source === 'composite') return null;
  const normalized = String(source).replace(/^\/+/, '');
  return `/avatar-assets/${normalized}`;
}

function part(url, tint, role, priority = 0, evidence = 'avatar-design-base') {
  return { url, tint, role, priority, evidence };
}

function baseArmParts(textureId, colors) {
  const suffix = {
    ArmIdle: 'idle',
    ArmWalk1: 'walk1',
    ArmWalk2: 'walk2',
    ArmWalk3: 'walk3',
    ArmRaise: 'raise'
  }[textureId];

  if (suffix) {
    return [part(`/avatar-assets/avatars/body/base/unisex/arm_${suffix}.png`, colors.skin, 'base-skin')];
  }

  const wave = {
    ArmRaiseWave1: 'raise_wave1.png',
    ArmRaiseWave2: 'raise_wave2.png'
  }[textureId];

  return wave
    ? [part(`/avatar-assets/avatars/body/base/unisex/${wave}`, colors.skin, 'base-skin')]
    : [];
}

function baseLegParts(textureId, colors) {
  const suffix = {
    LegIdle: 'idle',
    LegWalk1: 'walk1',
    LegWalk2: 'walk2',
    LegWalk3: 'walk3',
    LegWalk4: 'walk4'
  }[textureId];

  if (!suffix) return [];

  return [part(`/avatar-assets/avatars/body/base/unisex/leg_${suffix}.png`, colors.skin, 'base-skin')];
}

function equipmentParts(textureId, equipment, colors) {
  return (equipment.spritesByCompositeId[textureId] ?? []).map((sprite) => part(
    assetUrl(sprite.source),
    sprite.tint ?? colors[sprite.tintKey] ?? null,
    sprite.role,
    sprite.priority,
    sprite.evidence
  ));
}

function textureParts(layer, appearance, equipment) {
  if (layer.textureSource !== 'composite') {
    const url = assetUrl(layer.textureSource);
    return url
      ? [part(url, layer.textureId === 'Head' ? appearance.colors.skin : null, 'authored-texture')]
      : [];
  }

  if (layer.textureId === 'Torso') {
    return [
      part(
        `/avatar-assets/avatars/body/base/${appearance.gender}/torso.png`,
        appearance.colors.skin,
        'base-skin'
      ),
      ...equipmentParts(layer.textureId, equipment, appearance.colors)
    ];
  }

  return [
    ...baseArmParts(layer.textureId, appearance.colors),
    ...baseLegParts(layer.textureId, appearance.colors),
    ...equipmentParts(layer.textureId, equipment, appearance.colors)
  ].sort((left, right) => left.priority - right.priority);
}

function firstLayerByNode(frame) {
  return Object.fromEntries(
    frame.nodes
      .filter((node) => node.layers.length > 0)
      .map((node) => [node.id, node.layers[0]])
  );
}

function layerCanvasPosition(nodeId, layer, referenceLayer) {
  const anchor = FORWARD_IDLE_CANVAS_ANCHORS[nodeId];
  if (!anchor) return null;

  return {
    x: anchor.x + layer.pixelOffset.x - (referenceLayer?.pixelOffset.x ?? 0),
    y: anchor.y + layer.pixelOffset.y - (referenceLayer?.pixelOffset.y ?? 0)
  };
}

/**
 * Convert one compiled avatar.xml frame into the canvas rig consumed by the
 * renderer. Base skin is always emitted from the recovered avatar design. The
 * default jumpsuit is emitted only when selected by captured config; external
 * equipment is accepted only from authored item fragment XML.
 */
export function buildAvatarXmlBodyRig(model, {
  animationId = 'Idle',
  angle = FORWARD_AVATAR_ANGLE,
  frameIndex = 0,
  gender = 'female',
  selectedOptions = {},
  configXml = null,
  equipment = null
} = {}) {
  const plan = buildAvatarAnimationFramePlan(model, animationId, { angle });
  const index = normalizedFrameIndex(frameIndex, plan.frames.length);
  const frame = plan.frames[index];
  const referenceFrame = buildAvatarAnimationFramePlan(model, 'Idle', {
    angle: FORWARD_AVATAR_ANGLE
  }).frames[0];
  const references = firstLayerByNode(referenceFrame);
  const resolvedEquipment = equipment ?? resolveAvatarEquipment({
    configXml,
    selectedOptions,
    gender
  });
  const appearance = getAvatarBaseAppearance({
    gender: resolvedEquipment.gender,
    selectedOptions: resolvedEquipment.selectedOptions
  });
  const nodes = Object.fromEntries(frame.nodes.map((node) => [node.id, node]));
  const layers = [];
  const unresolvedCompositeTextures = new Set();

  for (const nodeId of NODE_DRAW_ORDER) {
    const node = nodes[nodeId];
    if (!node) continue;

    for (const [nodeLayerIndex, layer] of node.layers.entries()) {
      const position = layerCanvasPosition(nodeId, layer, references[nodeId]);
      if (!position) continue;

      const parts = textureParts(layer, appearance, resolvedEquipment);
      if (layer.textureSource === 'composite' && parts.length === 0) {
        unresolvedCompositeTextures.add(layer.textureId);
      }

      for (const [partIndex, resolvedPart] of parts.entries()) {
        layers.push({
          id: `${nodeId}:${layer.layerId}:${resolvedPart.role}:${nodeLayerIndex}:${partIndex}`,
          nodeId,
          sourceLayerId: layer.layerId,
          sourceTextureId: layer.textureId,
          role: resolvedPart.role,
          evidence: resolvedPart.evidence,
          priority: resolvedPart.priority,
          url: resolvedPart.url,
          x: position.x,
          y: position.y,
          cols: layer.textureGrid?.cols ?? 1,
          rows: layer.textureGrid?.rows ?? 1,
          col: layer.cell.col,
          row: layer.cell.row,
          tint: resolvedPart.tint,
          flip: { ...layer.flip },
          alpha: layer.alpha,
          blendMode: layer.blendMode
        });
      }
    }
  }

  const headNode = nodes.Head;
  const headLayer = headNode?.layers[0];
  const headReference = references.Head;
  const customHead = {
    ...appearance.head,
    x: appearance.head.x + (headLayer?.pixelOffset.x ?? 0) - (headReference?.pixelOffset.x ?? 0),
    y: appearance.head.y + (headLayer?.pixelOffset.y ?? 0) - (headReference?.pixelOffset.y ?? 0),
    supported: Number(angle) === FORWARD_AVATAR_ANGLE
  };

  return {
    canvas: { width: 128, height: 256 },
    gender: appearance.gender,
    colors: appearance.colors,
    head: customHead,
    layers,
    animation: {
      id: animationId,
      angle: plan.angle,
      frameIndex: index,
      frameCount: plan.frames.length,
      frameId: frame.id,
      framerate: plan.framerate,
      durationSeconds: plan.durationSeconds,
      nestedTimeline: plan.nestedTimeline,
      loop: plan.loop
    },
    oracleComparable: animationId === 'Idle'
      && Number(angle) === FORWARD_AVATAR_ANGLE
      && index === 0,
    completeness: {
      authoredAvatarXml: true,
      authoredAnimationTiming: true,
      authoredAngleViews: true,
      reconstructedForwardHeadSlot: Number(angle) === FORWARD_AVATAR_ANGLE,
      capturedEquipmentConfig: resolvedEquipment.source === 'captured-avatar-config',
      equippedItemXml: resolvedEquipment.compiledFragmentCount > 0,
      externalEquipmentResolved: resolvedEquipment.externalSelections.length === 0
        || resolvedEquipment.fullyResolved,
      compositeTextures: resolvedEquipment.externalSelections.length === 0
        ? 'captured-config-default-jumpsuit'
        : (resolvedEquipment.fullyResolved ? 'captured-item-fragment-xml' : 'incomplete-captured-equipment')
    },
    equipment: {
      source: resolvedEquipment.source,
      externalSelections: resolvedEquipment.externalSelections,
      diagnostics: resolvedEquipment.diagnostics
    },
    warnings: [
      ...[...unresolvedCompositeTextures]
        .sort()
        .map((textureId) => `No base-body fill is available for composite texture ${textureId}`),
      ...resolvedEquipment.diagnostics.map((diagnostic) => diagnostic.message)
    ]
  };
}
