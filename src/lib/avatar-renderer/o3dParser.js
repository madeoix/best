function parseNumbers(text) {
  return String(text ?? '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function attrNumber(node, names) {
  for (const name of names) {
    const v = node.getAttribute(name);
    if (v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readMaterials(xml) {
  const materials = new Map();

  for (const node of xml.querySelectorAll('materials > material, material')) {
    const id = node.getAttribute('id') ?? String(materials.size);
    const name = node.getAttribute('name') ?? `material_${id}`;
    const texture = node.querySelector('texture')?.getAttribute('source') ?? null;

    materials.set(String(id), { id: String(id), name, texture });
  }

  return materials;
}

function readVertices(meshNode) {
  const vertices = [];

  for (const node of meshNode.querySelectorAll('vertices > vertex, vertices > v, vertex, v')) {
    const x = attrNumber(node, ['x', 'X']);
    const y = attrNumber(node, ['y', 'Y']);
    const z = attrNumber(node, ['z', 'Z']);

    if (x !== null && y !== null) {
      vertices.push([x, y, z ?? 0]);
      continue;
    }

    const nums = parseNumbers(node.textContent);
    if (nums.length >= 2) vertices.push([nums[0], nums[1], nums[2] ?? 0]);
  }

  return vertices;
}

function readUVs(meshNode) {
  const uvs = [];

  for (const node of meshNode.querySelectorAll('uvs > uv, uv')) {
    const u = attrNumber(node, ['u', 'U']);
    const v = attrNumber(node, ['v', 'V']);
    if (u !== null && v !== null) uvs.push([u, 1 - v]);
  }

  return uvs;
}

function readFaces(meshNode) {
  const faces = [];

  for (const node of meshNode.querySelectorAll('faces > face, faces > f, face, f')) {
    const a = attrNumber(node, ['a', 'v0', 'i0']);
    const b = attrNumber(node, ['b', 'v1', 'i1']);
    const c = attrNumber(node, ['c', 'v2', 'i2']);

    if (a === null || b === null || c === null) continue;

    const materialId = String(node.getAttribute('m') ?? '0');
    const uvNode = node.querySelector('uv');
    let uv = null;

    if (uvNode) {
      const ua = attrNumber(uvNode, ['a', 'u0', 'i0']);
      const ub = attrNumber(uvNode, ['b', 'u1', 'i1']);
      const uc = attrNumber(uvNode, ['c', 'u2', 'i2']);
      if (ua !== null && ub !== null && uc !== null) uv = [ua, ub, uc];
    }

    faces.push({ vertices: [a, b, c], uv, materialId });
  }

  return faces;
}

export function parseO3D(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const materials = readMaterials(xml);
  const meshes = [];

  for (const meshNode of xml.querySelectorAll('mesh')) {
    const name =
      meshNode.getAttribute('name') ||
      meshNode.getAttribute('id') ||
      `mesh_${meshes.length}`;

    meshes.push({
      name,
      vertices: readVertices(meshNode),
      uvs: readUVs(meshNode),
      faces: readFaces(meshNode)
    });
  }

  return { materials, meshes };
}
