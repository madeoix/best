import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/lib/components/avatar/SmallverseO3DRenderStage.svelte', import.meta.url),
  'utf8'
);

test('O3D lab frames a head at avatar scale instead of filling the panel', () => {
  assert.match(source, /modelRoot\.scale\.setScalar\(1\.45 \/ maxDim\)/);
  assert.doesNotMatch(source, /setScalar\(4\.2 \/ maxDim\)/);
  assert.match(source, /controls\.autoRotate = false/);
});

test('O3D lab uses installed calibration output as its oracle when available', () => {
  assert.match(source, /\/avatar-calibration\/\$\{encodeURIComponent\(avatarId\)\}\/manifest\.json/);
  assert.match(source, /state\?\.body/);
  assert.match(source, /Browser O3D head reconstruction/);
});
