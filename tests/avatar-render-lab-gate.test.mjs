import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = fs.readFileSync(
  path.join(root, 'src/routes/avatar-render/[avatarId]/+page.svelte'),
  'utf8'
);

test('experimental O3D renderer is gated behind an explicit user action', () => {
  assert.match(route, /let reconstructionOpen = false/);
  assert.match(route, /on:click=\{\(\) => \(reconstructionOpen = !reconstructionOpen\)\}/);
  assert.match(route, /\{#if reconstructionOpen\}[\s\S]*<SmallverseO3DRenderStage \{avatarId\} \/>/);
});

test('captured or preserved render remains the production source', () => {
  assert.match(route, /Experimental reconstruction never replaces it automatically/);
  assert.match(route, /<SmallverseAvatarOracleImage[\s\S]*source=\{renderSource\}/);
});

test('calibration gallery is wired into the renderer evidence route', () => {
  assert.match(route, /SmallverseAvatarCalibrationGrid/);
  assert.match(route, /<SmallverseAvatarCalibrationGrid \{avatarId\} \/>/);
});
