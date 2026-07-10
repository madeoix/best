import * as THREE from 'three';

// SmallVerse head-design format coordinates, shared by avatar manifests.
// These describe the source format, not any individual avatar.
const HEAD_DESIGN_WIDTH = 1024;
const HEAD_DESIGN_HEIGHT = 512;
const HEAD_PROJECTION_SCALE = 0.72;

export function getObjectBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  return { box, size, center };
}

export function findPrimaryFaceMesh(root) {
  let best = null;
  let bestScore = -Infinity;

  root.traverse((obj) => {
    if (!obj?.isMesh || !obj.geometry) return;

    const name = String(obj.name ?? '').toLowerCase();
    const bounds = getObjectBounds(obj);
    const area = bounds.size.x * bounds.size.y;

    let score = area;

    if (name.includes('face')) score += 100000;
    if (name.includes(':skin')) score += 25000;
    if (name.includes('nose')) score -= 50000;
    if (name.includes('hair')) score -= 50000;
    if (name.includes('glass') || name.includes('prop')) score -= 50000;

    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  });

  return best;
}

function makeFaceBasis(faceBounds, headBounds) {
  const nominalUp = new THREE.Vector3(0, 1, 0);

  const forward = faceBounds.center
    .clone()
    .sub(headBounds.center)
    .normalize();

  if (forward.lengthSq() < 0.000001) {
    forward.set(0, 0, -1);
  }

  if (Math.abs(forward.dot(nominalUp)) > 0.98) {
    nominalUp.set(0, 0, 1);
  }

  const right = new THREE.Vector3()
    .crossVectors(nominalUp, forward)
    .normalize();

  const up = new THREE.Vector3()
    .crossVectors(forward, right)
    .normalize();

  return { right, up, forward };
}

export function getHeadProjectionFrame(modelRoot) {
  modelRoot.updateMatrixWorld(true);

  const faceMesh = findPrimaryFaceMesh(modelRoot);
  const faceBounds = faceMesh
    ? getObjectBounds(faceMesh)
    : getObjectBounds(modelRoot);

  const headBounds = getObjectBounds(modelRoot);
  const basis = makeFaceBasis(faceBounds, headBounds);

  return {
    modelRoot,
    faceMesh,
    faceBounds,
    headBounds,
    ...basis
  };
}

export function flashPointToNormalized(transform) {
  const x = Number(transform?.x ?? transform?.tx ?? 512);
  const y = Number(transform?.y ?? transform?.ty ?? 256);

  return {
    x: (x - 512) / 512,
    y: (256 - y) / 256
  };
}

function flatProjectionPoint(sprite, frame) {
  const point = flashPointToNormalized(sprite.transform);
  const { center, size } = frame.faceBounds;

  return center
    .clone()
    .addScaledVector(frame.right, point.x * size.x * 0.72)
    .addScaledVector(frame.up, point.y * size.y * 0.72)
    .addScaledVector(frame.forward, size.z * 0.55);
}

function worldNormalToModelLocal(worldNormal, modelRoot) {
  const rootWorldQuaternion = new THREE.Quaternion();
  modelRoot.getWorldQuaternion(rootWorldQuaternion);

  return worldNormal
    .clone()
    .applyQuaternion(rootWorldQuaternion.invert())
    .normalize();
}

export function projectHeadSpriteToSurface(sprite, frame) {
  const fallbackPosition = flatProjectionPoint(sprite, frame);

  if (!frame.faceMesh) {
    return {
      position: fallbackPosition,
      normal: frame.forward.clone(),
      hit: false
    };
  }

  frame.modelRoot.updateMatrixWorld(true);
  frame.faceMesh.updateMatrixWorld(true);

  const rayOriginLocal = fallbackPosition
    .clone()
    .addScaledVector(
      frame.forward,
      Math.max(
        frame.faceBounds.size.x,
        frame.faceBounds.size.y,
        frame.faceBounds.size.z
      )
    );

  const rayOriginWorld = frame.modelRoot.localToWorld(rayOriginLocal.clone());

  const directionLocal = frame.forward.clone().negate();
  const rootWorldQuaternion = new THREE.Quaternion();
  frame.modelRoot.getWorldQuaternion(rootWorldQuaternion);

  const directionWorld = directionLocal
    .clone()
    .applyQuaternion(rootWorldQuaternion)
    .normalize();

  const raycaster = new THREE.Raycaster(
    rayOriginWorld,
    directionWorld,
    0,
    Infinity
  );

  const hits = raycaster.intersectObject(frame.faceMesh, true);

  if (!hits.length) {
    return {
      position: fallbackPosition,
      normal: frame.forward.clone(),
      hit: false
    };
  }

  const hit = hits[0];
  const position = frame.modelRoot.worldToLocal(hit.point.clone());

  let worldNormal = frame.forward.clone();

  if (hit.face?.normal) {
    const normalMatrix = new THREE.Matrix3()
      .getNormalMatrix(hit.object.matrixWorld);

    worldNormal = hit.face.normal
      .clone()
      .applyMatrix3(normalMatrix)
      .normalize();
  }

  const normal = worldNormalToModelLocal(
    worldNormal,
    frame.modelRoot
  );

  const surfaceOffset = Math.max(
    frame.faceBounds.size.x,
    frame.faceBounds.size.y
  ) * 0.002;

  position.addScaledVector(normal, surfaceOffset);

  return {
    position,
    normal,
    hit: true
  };
}

export function spriteScaleToFace(sprite, frame, texture) {
  const image =
    texture?.source?.data ?? texture?.image;

  const bitmapWidth = Number(
    image?.naturalWidth ??
    image?.videoWidth ??
    image?.width ??
    1
  );

  const bitmapHeight = Number(
    image?.naturalHeight ??
    image?.videoHeight ??
    image?.height ??
    1
  );

  const scaleX =
    Math.abs(Number(sprite.transform?.scaleX ?? 1)) || 1;

  const scaleY =
    Math.abs(Number(sprite.transform?.scaleY ?? 1)) || 1;

  // Use the same derivative as the Flash-point projection:
  //
  // x world units per design pixel =
  // face width × projection scale / half design width
  //
  // y world units per design pixel =
  // face height × projection scale / half design height
  const worldWidth =
    bitmapWidth *
    scaleX *
    frame.faceBounds.size.x *
    HEAD_PROJECTION_SCALE /
    (HEAD_DESIGN_WIDTH / 2);

  const worldHeight =
    bitmapHeight *
    scaleY *
    frame.faceBounds.size.y *
    HEAD_PROJECTION_SCALE /
    (HEAD_DESIGN_HEIGHT / 2);

  const epsilon = Math.max(
    frame.faceBounds.size.x,
    frame.faceBounds.size.y
  ) * 0.0001;

  return [
    Math.max(worldWidth, epsilon),
    Math.max(worldHeight, epsilon)
  ];
}

export function orientPlaneToSurface(object, normal, frame) {
  const forward = normal.clone().normalize();

  // Project the face's universal up vector onto the hit tangent plane.
  const referenceUp =
    frame?.up?.clone() ?? new THREE.Vector3(0, 1, 0);

  const tangentUp = referenceUp
    .clone()
    .sub(forward.clone().multiplyScalar(referenceUp.dot(forward)))
    .normalize();

  // Degenerate fallback for unusual triangles.
  if (tangentUp.lengthSq() < 0.000001) {
    const referenceRight =
      frame?.right?.clone() ?? new THREE.Vector3(1, 0, 0);

    tangentUp.copy(referenceRight)
      .sub(
        forward
          .clone()
          .multiplyScalar(referenceRight.dot(forward))
      )
      .normalize();
  }

  const tangentRight = new THREE.Vector3()
    .crossVectors(tangentUp, forward)
    .normalize();

  const basis = new THREE.Matrix4().makeBasis(
    tangentRight,
    tangentUp,
    forward
  );

  object.quaternion.setFromRotationMatrix(basis);
}
