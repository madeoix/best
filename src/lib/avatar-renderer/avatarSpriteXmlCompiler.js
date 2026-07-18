/**
 * Compiles the recovered SmallWorlds SpriteItem XML into renderer-neutral data.
 *
 * This module intentionally has no DOM or Svelte dependency. It can run in a
 * browser, a worker, or Node tests, and it preserves the timing defaults used
 * by SpriteModelAnimationIso/FrameIso in the recovered client.
 */

export const SMALLWORLDS_DEFAULT_FRAMERATE = 5;
export const SMALLWORLDS_DEFAULT_FRAME_DURATION = 1;

const NUMBER_ATTRIBUTES = new Set([
  'a',
  'alpha',
  'angle',
  'col',
  'cols',
  'duration',
  'framerate',
  'h',
  'loops',
  'row',
  'rows',
  'w',
  'x',
  'y',
  'z'
]);

const BOOLEAN_ATTRIBUTES = new Set([
  'hm',
  'loop',
  'mirror',
  'overridable',
  'visible',
  'vm'
]);

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of source.matchAll(pattern)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }

  return attributes;
}

function parseXml(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('Avatar SpriteItem XML must be a non-empty string');
  }

  const documentNode = { name: '#document', attributes: {}, children: [] };
  const stack = [documentNode];
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<[^>]+>/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) {
      continue;
    }

    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim();
      const current = stack.pop();

      if (!current || current.name !== name) {
        throw new Error(`Malformed SpriteItem XML: expected </${current?.name ?? ''}> but found </${name}>`);
      }

      continue;
    }

    const selfClosing = token.endsWith('/>');
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const separator = body.search(/\s/);
    const name = separator === -1 ? body : body.slice(0, separator);
    const attributeSource = separator === -1 ? '' : body.slice(separator + 1);
    const node = {
      name,
      attributes: parseAttributes(attributeSource),
      children: []
    };

    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }

  if (stack.length !== 1) {
    throw new Error(`Malformed SpriteItem XML: unclosed <${stack.at(-1).name}> element`);
  }

  if (documentNode.children.length !== 1) {
    throw new Error('Avatar SpriteItem XML must contain exactly one root element');
  }

  return documentNode.children[0];
}

function children(element, name) {
  return element?.children.filter((child) => child.name === name) ?? [];
}

function child(element, name) {
  return children(element, name)[0] ?? null;
}

function numberAttribute(attributes, name, fallback = 0) {
  if (attributes[name] === undefined || attributes[name] === '') return fallback;

  const value = Number(attributes[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanAttribute(attributes, name, fallback = false) {
  if (attributes[name] === undefined) return fallback;
  return attributes[name] === 'true';
}

function typedAttributes(attributes) {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => {
      if (NUMBER_ATTRIBUTES.has(name)) return [name, numberAttribute(attributes, name)];
      if (BOOLEAN_ATTRIBUTES.has(name)) return [name, booleanAttribute(attributes, name)];
      return [name, value];
    })
  );
}

function vector2(attributes) {
  return {
    x: numberAttribute(attributes, 'x'),
    y: numberAttribute(attributes, 'y')
  };
}

function vector3(attributes) {
  return {
    x: numberAttribute(attributes, 'x'),
    y: numberAttribute(attributes, 'y'),
    z: numberAttribute(attributes, 'z')
  };
}

function vectorList(value) {
  if (!value) return null;

  const parts = value.split(',').map((part) => Number(part.trim()));
  return parts.every(Number.isFinite) ? parts : null;
}

function indexById(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function compileSamples(element) {
  return children(element, 'sample').map((sample) => ({
    id: sample.attributes.id ?? '',
    loops: numberAttribute(sample.attributes, 'loops', 1),
    attributes: typedAttributes(sample.attributes)
  }));
}

function compileTexture(element, index) {
  return {
    id: element.attributes.id ?? '',
    index,
    source: element.attributes.source ?? '',
    cols: numberAttribute(element.attributes, 'cols', 1),
    rows: numberAttribute(element.attributes, 'rows', 1),
    attributes: typedAttributes(element.attributes)
  };
}

function compileView(element, index) {
  // The recovered importer reads legacy `mirror` after `hm`, so it wins when
  // both attributes are present.
  const horizontalMirror = element.attributes.mirror !== undefined
    ? booleanAttribute(element.attributes, 'mirror')
    : booleanAttribute(element.attributes, 'hm');

  return {
    index,
    angle: numberAttribute(element.attributes, 'angle', -1),
    col: numberAttribute(element.attributes, 'col'),
    row: numberAttribute(element.attributes, 'row'),
    offset: vector2(element.attributes),
    alpha: numberAttribute(element.attributes, 'alpha', 1),
    flip: {
      horizontal: horizontalMirror,
      vertical: booleanAttribute(element.attributes, 'vm')
    },
    attributes: typedAttributes(element.attributes)
  };
}

function compileLayer(element, index) {
  const nestedLayers = children(element, 'layer').map(compileLayer);
  const views = children(element, 'view').map(compileView);

  return {
    id: element.attributes.id ?? '',
    index,
    type: element.attributes.type ?? 'texture',
    textureId: element.attributes.texture ?? null,
    align: element.attributes.align ?? 'bottom',
    orientation: element.attributes.orient ?? 'vertical',
    width: numberAttribute(element.attributes, 'w'),
    height: numberAttribute(element.attributes, 'h'),
    offset: vector2(element.attributes),
    views,
    viewsByAngle: Object.fromEntries(views.map((view) => [String(view.angle), view])),
    layers: nestedLayers,
    layersById: indexById(nestedLayers),
    attributes: typedAttributes(element.attributes)
  };
}

function compileLayerRef(element, index) {
  return {
    id: element.attributes.id ?? '',
    index,
    offset: vector2(element.attributes),
    color: element.attributes.color ?? null,
    alpha: numberAttribute(element.attributes, 'a', 1),
    blendMode: element.attributes.blend ?? 'normal',
    attributes: typedAttributes(element.attributes)
  };
}

function compileNodeFrame(element, index) {
  const nestedFrames = children(element, 'frame').map(compileNodeFrame);

  return {
    id: element.attributes.id ?? '',
    index,
    type: element.attributes.type ?? 'standard',
    layerRefs: children(element, 'layerref').map(compileLayerRef),
    frames: nestedFrames,
    framesById: indexById(nestedFrames),
    attributes: typedAttributes(element.attributes)
  };
}

function compileFrameRef(element, index) {
  return {
    id: element.attributes.id ?? '',
    index,
    duration: numberAttribute(
      element.attributes,
      'duration',
      SMALLWORLDS_DEFAULT_FRAME_DURATION
    ),
    samples: compileSamples(element),
    attributes: typedAttributes(element.attributes)
  };
}

function animationProperties(element) {
  const framesPerSecond = numberAttribute(
    element.attributes,
    'framerate',
    SMALLWORLDS_DEFAULT_FRAMERATE
  );

  return {
    id: element.attributes.id ?? '',
    framerate: framesPerSecond,
    explicitFramerate: element.attributes.framerate !== undefined,
    loop: booleanAttribute(element.attributes, 'loop', true),
    overridable: booleanAttribute(element.attributes, 'overridable', true)
  };
}

function compileNodeAnimation(element, index) {
  const frameRefs = children(element, 'frameref').map(compileFrameRef);
  const durationTicks = frameRefs.reduce((total, frame) => total + frame.duration, 0);

  return {
    ...animationProperties(element),
    index,
    frameRefs,
    durationTicks,
    durationSeconds: durationTicks / numberAttribute(
      element.attributes,
      'framerate',
      SMALLWORLDS_DEFAULT_FRAMERATE
    ),
    attributes: typedAttributes(element.attributes)
  };
}

function compileNode(element, index) {
  const layers = children(child(element, 'layers'), 'layer').map(compileLayer);
  const frames = children(child(element, 'frames'), 'frame').map(compileNodeFrame);
  const animations = children(child(element, 'animations'), 'animation').map(compileNodeAnimation);
  const box = child(element, 'box');

  return {
    id: element.attributes.id ?? '',
    index,
    type: element.attributes.type ?? 'sprite',
    position: vector3(element.attributes),
    bounds: box
      ? {
          min: vectorList(box.attributes.min),
          max: vectorList(box.attributes.max)
        }
      : null,
    layers,
    layersById: indexById(layers),
    frames,
    framesById: indexById(frames),
    animations,
    animationsById: indexById(animations),
    attributes: typedAttributes(element.attributes)
  };
}

function compileNodeRef(element, index) {
  return {
    id: element.attributes.id ?? '',
    index,
    visible: booleanAttribute(element.attributes, 'visible', true),
    positionOffset: vector3(element.attributes),
    angleOffset: numberAttribute(element.attributes, 'a'),
    frameId: element.attributes.frame ?? null,
    animationId: element.attributes.animation ?? null,
    samples: compileSamples(element),
    attributes: typedAttributes(element.attributes)
  };
}

function compileGlobalFrame(element, index) {
  return {
    id: element.attributes.id ?? '',
    index,
    duration: numberAttribute(
      element.attributes,
      'duration',
      SMALLWORLDS_DEFAULT_FRAME_DURATION
    ),
    positionOffset: vector3(element.attributes),
    angleOffset: numberAttribute(element.attributes, 'a'),
    nodeRefs: children(element, 'noderef').map(compileNodeRef),
    attributes: typedAttributes(element.attributes)
  };
}

function compileGlobalAnimation(element, index) {
  const frames = children(element, 'frame').map(compileGlobalFrame);
  const durationTicks = frames.reduce((total, frame) => total + frame.duration, 0);
  const properties = animationProperties(element);

  return {
    ...properties,
    index,
    frames,
    framesById: indexById(frames),
    durationTicks,
    durationSeconds: durationTicks / properties.framerate,
    attributes: typedAttributes(element.attributes)
  };
}

function collectStats(textures, nodes, animations) {
  return {
    textures: textures.length,
    nodes: nodes.length,
    nodeLayers: nodes.reduce((count, node) => count + node.layers.length, 0),
    nodeViews: nodes.reduce(
      (count, node) => count + node.layers.reduce((sum, layer) => sum + layer.views.length, 0),
      0
    ),
    nodeFrames: nodes.reduce((count, node) => count + node.frames.length, 0),
    nodeAnimations: nodes.reduce((count, node) => count + node.animations.length, 0),
    globalAnimations: animations.length,
    globalFrames: animations.reduce((count, animation) => count + animation.frames.length, 0)
  };
}

function validateReferences(texturesById, nodesById, animations) {
  const diagnostics = [];

  for (const node of Object.values(nodesById)) {
    for (const layer of node.layers) {
      if (layer.textureId && !texturesById[layer.textureId]) {
        diagnostics.push({
          level: 'error',
          code: 'unknown-texture',
          nodeId: node.id,
          layerId: layer.id,
          reference: layer.textureId
        });
      }
    }

    for (const frame of node.frames) {
      for (const layerRef of frame.layerRefs) {
        if (!node.layersById[layerRef.id]) {
          diagnostics.push({
            level: 'error',
            code: 'unknown-layer',
            nodeId: node.id,
            frameId: frame.id,
            reference: layerRef.id
          });
        }
      }
    }

    for (const animation of node.animations) {
      for (const frameRef of animation.frameRefs) {
        if (!node.framesById[frameRef.id]) {
          diagnostics.push({
            level: 'error',
            code: 'unknown-node-frame',
            nodeId: node.id,
            animationId: animation.id,
            reference: frameRef.id
          });
        }
      }
    }
  }

  for (const animation of animations) {
    for (const frame of animation.frames) {
      for (const nodeRef of frame.nodeRefs) {
        const node = nodesById[nodeRef.id];
        if (!node) {
          diagnostics.push({
            level: 'error',
            code: 'unknown-node',
            animationId: animation.id,
            frameId: frame.id,
            reference: nodeRef.id
          });
          continue;
        }

        if (nodeRef.frameId && !node.framesById[nodeRef.frameId]) {
          diagnostics.push({
            level: 'error',
            code: 'unknown-node-frame',
            animationId: animation.id,
            frameId: frame.id,
            nodeId: node.id,
            reference: nodeRef.frameId
          });
        }

        if (nodeRef.animationId && !node.animationsById[nodeRef.animationId]) {
          diagnostics.push({
            level: 'error',
            code: 'unknown-node-animation',
            animationId: animation.id,
            frameId: frame.id,
            nodeId: node.id,
            reference: nodeRef.animationId
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Compile a SmallWorlds item.SpriteItem XML document.
 */
export function compileAvatarSpriteXml(source) {
  const root = parseXml(source);

  if (root.name !== 'item.SpriteItem') {
    throw new Error(`Expected <item.SpriteItem>, received <${root.name}>`);
  }

  const textures = children(child(root, 'textures'), 'texture').map(compileTexture);
  const nodes = children(child(root, 'nodes'), 'node').map(compileNode);
  const animations = children(child(root, 'animations'), 'animation').map(compileGlobalAnimation);
  const texturesById = indexById(textures);
  const nodesById = indexById(nodes);
  const animationsById = indexById(animations);

  return {
    id: root.attributes.id ?? '',
    name: root.attributes.name ?? '',
    description: root.attributes.desc ?? '',
    defaults: {
      framerate: SMALLWORLDS_DEFAULT_FRAMERATE,
      frameDuration: SMALLWORLDS_DEFAULT_FRAME_DURATION
    },
    textures,
    texturesById,
    nodes,
    nodesById,
    animations,
    animationsById,
    stats: collectStats(textures, nodes, animations),
    diagnostics: validateReferences(texturesById, nodesById, animations),
    attributes: typedAttributes(root.attributes)
  };
}
