import {
  SMALLWORLDS_DEFAULT_FRAME_DURATION,
  SMALLWORLDS_DEFAULT_FRAMERATE
} from './avatarSpriteXmlCompiler.js';

function normalizeAngle(value) {
  const angle = Number(value) || 0;
  return ((angle % 360) + 360) % 360;
}

function circularDistance(a, b) {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, 360 - delta);
}

function greatestCommonDivisor(a, b) {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));

  while (right !== 0) {
    [left, right] = [right, left % right];
  }

  return left || 1;
}

function leastCommonMultiple(a, b) {
  if (!a || !b) return 0;
  return Math.abs(Math.trunc(a * b)) / greatestCommonDivisor(a, b);
}

function lcm(values) {
  return values.reduce((value, next) => leastCommonMultiple(value, next), 1);
}

function frameAtTick(frameRefs, tick) {
  const duration = frameRefs.reduce(
    (total, frame) => total + (frame.duration || SMALLWORLDS_DEFAULT_FRAME_DURATION),
    0
  );

  if (duration <= 0 || frameRefs.length === 0) return null;

  let cursor = ((tick % duration) + duration) % duration;
  for (const frame of frameRefs) {
    const frameDuration = frame.duration || SMALLWORLDS_DEFAULT_FRAME_DURATION;
    if (cursor < frameDuration) return frame;
    cursor -= frameDuration;
  }

  return frameRefs.at(-1);
}

function sum2(...vectors) {
  return vectors.reduce(
    (value, vector) => ({
      x: value.x + (vector?.x ?? 0),
      y: value.y + (vector?.y ?? 0)
    }),
    { x: 0, y: 0 }
  );
}

function sum3(...vectors) {
  return vectors.reduce(
    (value, vector) => ({
      x: value.x + (vector?.x ?? 0),
      y: value.y + (vector?.y ?? 0),
      z: value.z + (vector?.z ?? 0)
    }),
    { x: 0, y: 0, z: 0 }
  );
}

/**
 * Select the exact recovered view for an angle, falling back to ANY_ANGLE and
 * then the nearest authored view. Ties preserve XML order.
 */
export function resolveAvatarLayerView(model, nodeId, layerId, angle = 0) {
  const node = model?.nodesById?.[nodeId];
  const layer = node?.layersById?.[layerId];
  if (!layer) return null;

  const normalized = normalizeAngle(angle);
  const exact = layer.viewsByAngle[String(normalized)];
  const anyAngle = layer.viewsByAngle['-1'];
  const view = exact ?? anyAngle ?? layer.views.reduce((best, candidate) => {
    if (!best) return candidate;
    return circularDistance(candidate.angle, normalized) < circularDistance(best.angle, normalized)
      ? candidate
      : best;
  }, null);

  if (!view) {
    return {
      angle: normalized,
      authoredAngle: null,
      col: 0,
      row: 0,
      offset: { ...layer.offset },
      layerOffset: { ...layer.offset },
      viewOffset: { x: 0, y: 0 },
      alpha: 1,
      flip: { horizontal: false, vertical: false }
    };
  }

  return {
    angle: normalized,
    authoredAngle: view.angle,
    col: view.col,
    row: view.row,
    offset: sum2(layer.offset, view.offset),
    layerOffset: { ...layer.offset },
    viewOffset: { ...view.offset },
    alpha: view.alpha,
    flip: { ...view.flip }
  };
}

function resolveLayers(model, node, nodeFrame, angle) {
  let layerRefs = nodeFrame?.layerRefs ?? [];

  // Nodes such as Shadow have one authored layer and no named frames. The
  // original SpriteNodeIso displays that layer when the node itself is used.
  if (!nodeFrame && node.frames.length === 0) {
    layerRefs = node.layers.map((layer, index) => ({
      id: layer.id,
      index,
      offset: { x: 0, y: 0 },
      alpha: 1,
      blendMode: 'normal',
      color: null
    }));
  }

  return layerRefs.flatMap((layerRef) => {
    const layer = node.layersById[layerRef.id];
    if (!layer || layer.type === 'group') return [];

    const view = resolveAvatarLayerView(model, node.id, layer.id, angle);
    const texture = layer.textureId ? model.texturesById[layer.textureId] ?? null : null;

    return [{
      nodeId: node.id,
      frameId: nodeFrame?.id ?? null,
      layerId: layer.id,
      textureId: layer.textureId,
      textureSource: texture?.source ?? null,
      textureGrid: texture
        ? { cols: texture.cols, rows: texture.rows }
        : null,
      cell: view ? { col: view.col, row: view.row } : { col: 0, row: 0 },
      angle: view?.angle ?? normalizeAngle(angle),
      authoredAngle: view?.authoredAngle ?? null,
      pixelOffset: sum2(view?.offset, layerRef.offset),
      layerOffset: view?.layerOffset ?? { ...layer.offset },
      viewOffset: view?.viewOffset ?? { x: 0, y: 0 },
      frameOffset: { ...layerRef.offset },
      flip: view?.flip ?? { horizontal: false, vertical: false },
      alpha: (view?.alpha ?? 1) * (layerRef.alpha ?? 1),
      blendMode: layerRef.blendMode ?? 'normal',
      color: layerRef.color ?? null
    }];
  });
}

function resolveNode(model, globalFrame, nodeRef, localTick, angle) {
  const node = model.nodesById[nodeRef.id];
  if (!node) return null;

  const nodeAnimation = nodeRef.animationId
    ? node.animationsById[nodeRef.animationId] ?? null
    : null;
  const localFrameRef = nodeAnimation
    ? frameAtTick(nodeAnimation.frameRefs, localTick)
    : null;
  const nodeFrameId = nodeRef.frameId ?? localFrameRef?.id ?? null;
  const nodeFrame = nodeFrameId ? node.framesById[nodeFrameId] ?? null : null;
  const resolvedAngle = normalizeAngle(
    angle + (globalFrame.angleOffset ?? 0) + (nodeRef.angleOffset ?? 0)
  );

  return {
    id: node.id,
    type: node.type,
    visible: nodeRef.visible,
    frameId: nodeFrameId,
    animationId: nodeRef.animationId,
    position: sum3(node.position, globalFrame.positionOffset, nodeRef.positionOffset),
    basePosition: { ...node.position },
    framePositionOffset: { ...globalFrame.positionOffset },
    nodePositionOffset: { ...nodeRef.positionOffset },
    angle: resolvedAngle,
    samples: nodeRef.samples,
    layers: nodeRef.visible ? resolveLayers(model, node, nodeFrame, resolvedAngle) : []
  };
}

function nestedAnimationRefs(model, globalFrame) {
  return globalFrame.nodeRefs.flatMap((nodeRef) => {
    if (!nodeRef.animationId) return [];
    const animation = model.nodesById[nodeRef.id]?.animationsById?.[nodeRef.animationId];
    return animation ? [{ nodeRef, animation }] : [];
  });
}

function buildStaticPlan(model, animation, angle) {
  let startTick = 0;

  const frames = animation.frames.map((globalFrame, index) => {
    const durationTicks = globalFrame.duration || SMALLWORLDS_DEFAULT_FRAME_DURATION;
    const planFrame = {
      index,
      id: globalFrame.id,
      sourceFrameIndex: globalFrame.index,
      startTick,
      durationTicks,
      startSeconds: startTick / animation.framerate,
      durationSeconds: durationTicks / animation.framerate,
      nodes: globalFrame.nodeRefs
        .map((nodeRef) => resolveNode(model, globalFrame, nodeRef, 0, angle))
        .filter(Boolean)
    };
    startTick += durationTicks;
    return planFrame;
  });

  return {
    framerate: animation.framerate,
    sourceFramerate: animation.framerate,
    durationTicks: startTick,
    durationSeconds: startTick / animation.framerate,
    nestedTimeline: false,
    frames
  };
}

function buildNestedPlan(model, animation, globalFrame, refs, angle) {
  const rates = refs.map(({ animation: nested }) => nested.framerate);
  const masterFramerate = lcm(rates);
  const cycleLengths = refs.map(({ animation: nested }) => (
    nested.durationTicks * masterFramerate / nested.framerate
  ));
  const durationTicks = lcm(cycleLengths);
  const frames = [];

  for (let tick = 0; tick < durationTicks; tick += 1) {
    const nodes = globalFrame.nodeRefs.map((nodeRef) => {
      const nested = nodeRef.animationId
        ? model.nodesById[nodeRef.id]?.animationsById?.[nodeRef.animationId]
        : null;
      const localTick = nested
        ? Math.floor(tick * nested.framerate / masterFramerate)
        : 0;
      return resolveNode(model, globalFrame, nodeRef, localTick, angle);
    }).filter(Boolean);

    frames.push({
      index: tick,
      id: `${globalFrame.id}:${tick}`,
      sourceFrameIndex: globalFrame.index,
      startTick: tick,
      durationTicks: 1,
      startSeconds: tick / masterFramerate,
      durationSeconds: 1 / masterFramerate,
      nodes
    });
  }

  return {
    framerate: masterFramerate,
    sourceFramerate: animation.framerate,
    durationTicks,
    durationSeconds: durationTicks / masterFramerate,
    nestedTimeline: true,
    frames
  };
}

/**
 * Build an immutable-in-practice frame plan for an authored animation name.
 *
 * A one-frame global animation such as Walk can start independent node-level
 * animations. In that case the plan expands the least common complete cycle
 * so the head's three-frame gait and the limbs' four-frame gait remain in the
 * exact sequences authored in avatar.xml.
 */
export function buildAvatarAnimationFramePlan(model, animationId, { angle = 0 } = {}) {
  const animation = model?.animationsById?.[animationId];
  if (!animation) {
    throw new Error(`Unknown avatar animation: ${animationId}`);
  }

  const onlyFrame = animation.frames.length === 1 ? animation.frames[0] : null;
  const refs = onlyFrame ? nestedAnimationRefs(model, onlyFrame) : [];
  const timeline = onlyFrame && refs.length > 0
    ? buildNestedPlan(model, animation, onlyFrame, refs, angle)
    : buildStaticPlan(model, animation, angle);

  return {
    animationId: animation.id,
    loop: animation.loop,
    overridable: animation.overridable,
    angle: normalizeAngle(angle),
    defaults: {
      framerate: SMALLWORLDS_DEFAULT_FRAMERATE,
      frameDuration: SMALLWORLDS_DEFAULT_FRAME_DURATION
    },
    ...timeline
  };
}
