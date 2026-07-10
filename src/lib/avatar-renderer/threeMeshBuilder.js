import * as THREE from 'three';
import { createSmallverseMaterial } from './materialResolver.js';

function buildMaterialGeometry(parsedMesh, faces) {
  const positions = [];
  const uvs = [];

  for (const face of faces) {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = face.vertices[corner];
      const uvIndex = face.uv?.[corner];

      const vertex = parsedMesh.vertices[vertexIndex];
      if (!vertex) continue;

      positions.push(vertex[0], vertex[1], vertex[2]);

      const uv =
        uvIndex !== undefined && uvIndex !== null
          ? parsedMesh.uvs[uvIndex]
          : null;

      uvs.push(uv?.[0] ?? 0, uv?.[1] ?? 0);
    }
  }

  if (positions.length < 9) return null;

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );

  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(uvs, 2)
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function groupFacesByMaterial(parsedMesh) {
  const groups = new Map();

  for (const face of parsedMesh.faces) {
    const materialId = String(face.materialId ?? '0');

    if (!groups.has(materialId)) {
      groups.set(materialId, []);
    }

    groups.get(materialId).push(face);
  }

  return groups;
}

export function buildThreeMeshGroup({
  parsedMesh,
  sourceUrl,
  materials,
  avatarId,
  materialContext = null,
  showWireframe = false
}) {
  const root = new THREE.Group();
  root.name = parsedMesh.name;

  const faceGroups = groupFacesByMaterial(parsedMesh);

  for (const [materialId, faces] of faceGroups) {
    const geometry = buildMaterialGeometry(parsedMesh, faces);
    if (!geometry) continue;

    const o3dMaterial =
      materials?.get?.(String(materialId)) ?? {
        id: materialId,
        name: `material_${materialId}`,
        texture: null
      };

    const material = createSmallverseMaterial({
      meshName: parsedMesh.name,
      sourceUrl,
      o3dMaterial,
      avatarId,
      materialContext
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${parsedMesh.name}:${o3dMaterial.name}`;
    mesh.userData = {
      sourceUrl,
      parsedMeshName: parsedMesh.name,
      materialId,
      materialName: o3dMaterial.name,
      materialTexture: o3dMaterial.texture
    };

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: 0x7bdcff,
        transparent: true,
        opacity: 0.18
      })
    );

    wire.name = 'wireframe';
    wire.visible = showWireframe;
    mesh.add(wire);

    root.add(mesh);
  }

  return root.children.length ? root : null;
}
