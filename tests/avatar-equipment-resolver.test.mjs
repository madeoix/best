import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  compileAvatarEquipmentFragmentXml,
  parseAvatarConfigXml,
  resolveAvatarEquipment
} from '../src/lib/avatar-renderer/avatarEquipmentResolver.js';

const capturedConfig = await readFile(
  new URL('../static/avatar-calibration/6a5282730fb7252c02b53634/live-config.xml', import.meta.url),
  'utf8'
);

const luckyTshirtFragmentSubset = `
<f id="Top01_17_StP" parentId="Top01">
  <b id="Gender" sel="Female">
    <g id="Male"><s id="TorsoMale" cId="Torso" s="items/base/consumables/clothing/top01/top01_17_stp_m.png" pri="1"/></g>
    <g id="Female"><s id="TorsoFemale" cId="Torso" s="items/base/consumables/clothing/top01/top01_17_stp_f.png" pri="1"/></g>
  </b>
  <g id="TopTshirtLogo">
    <s id="ArmBase" cId="ArmIdle" s="items/base/consumables/clothing/shared/shr_short_arm_idle.png" pri="1"/>
    <c sId="ArmBase" c="4154901"/>
    <s id="ArmStripe" cId="ArmIdle" s="items/base/consumables/clothing/top01/top01_14_stripe_idle.png" pri="1.1"/>
    <c sId="ArmStripe" c="16752896"/>
  </g>
  <g id="Icon"><s id="IconSprite" cId="IconTop01_17" s="items/base/consumables/clothing/top01/top01_17_icon_stp.png"/></g>
</f>`;

test('captured avatar config resolves authentic default outfit selections', async () => {
  const parsed = parseAvatarConfigXml(capturedConfig);
  const equipment = resolveAvatarEquipment({ configXml: capturedConfig });

  assert.equal(parsed.gender, 'male');
  assert.equal(parsed.selectedOptions.JSTop, 'JumpTshirt');
  assert.equal(parsed.selectedOptions.JSBottom, 'JumpPants');
  assert.equal(parsed.selectedOptions.JSFeet, 'NoShoe');
  assert.deepEqual(parsed.externalSelections, []);
  assert.equal(equipment.source, 'captured-avatar-config');
  assert.equal(equipment.diagnostics.length, 0);
  assert.ok(equipment.sprites.some((sprite) => sprite.role === 'captured-default-top'));
  assert.ok(equipment.sprites.some((sprite) => sprite.role === 'captured-default-bottom'));
  assert.ok(equipment.sprites.some((sprite) => sprite.role === 'captured-default-feet'));

  for (const sprite of equipment.sprites) {
    await assert.doesNotReject(
      access(new URL(`../static/avatar-assets/${sprite.source}`, import.meta.url)),
      sprite.source
    );
  }
});

test('an equipped external slot is never replaced with the default shirt', () => {
  const config = capturedConfig.replace('<option id="Top01" sel=""/>', '<option id="Top01" sel="Top01_17_StP"/>');
  const equipment = resolveAvatarEquipment({ configXml: config });

  assert.ok(!equipment.sprites.some((sprite) => sprite.role === 'captured-default-top'));
  assert.ok(equipment.diagnostics.some((diagnostic) => (
    diagnostic.code === 'missing-item-fragment'
      && diagnostic.slot === 'Top01'
      && diagnostic.selection === 'Top01_17_StP'
  )));
});

test('real Lucky T-shirt fragment structure compiles and reports exact missing sprite sheets', () => {
  const availableAssetPaths = new Set([
    'items/base/consumables/clothing/shared/shr_short_arm_idle.png'
  ]);
  const compiled = compileAvatarEquipmentFragmentXml(luckyTshirtFragmentSubset, {
    gender: 'female',
    availableAssetPaths
  });

  assert.ok(compiled.sprites.some((sprite) => sprite.source.endsWith('top01_17_stp_f.png')));
  assert.ok(!compiled.sprites.some((sprite) => sprite.source.endsWith('top01_17_stp_m.png')));
  assert.ok(!compiled.sprites.some((sprite) => sprite.compositeId.startsWith('Icon')));
  assert.equal(
    compiled.sprites.find((sprite) => sprite.id === 'ArmBase').tint,
    '#3f6615'
  );
  assert.deepEqual(
    compiled.diagnostics.map((diagnostic) => diagnostic.source).sort(),
    [
      'items/base/consumables/clothing/top01/top01_14_stripe_idle.png',
      'items/base/consumables/clothing/top01/top01_17_stp_f.png'
    ]
  );
});
