import type { Avatar, ItemDefinition, Space } from './domain.js';
import { isPublicCatalogEligible } from './domain.js';

export type PublicEntityKind = 'avatar' | 'item' | 'space';

export type PublicationReasonCode =
  | 'AVATAR_NAME_UNRESOLVED'
  | 'AVATAR_PORTRAIT_MISSING'
  | 'ITEM_NOT_XML_RARE_OR_LEGENDARY'
  | 'ITEM_ICON_MISSING'
  | 'SPACE_NAME_UNRESOLVED'
  | 'SPACE_SNAPSHOT_MISSING';

export interface PublicationDecision {
  entityKind: PublicEntityKind;
  eligible: boolean;
  reasons: PublicationReasonCode[];
}

/** A capture may echo the canonical key into a display-name field.  That is
 * transport data, not a resolved public location name. */
function isEchoedCanonicalId(value: string | null, key: string): boolean {
  const name = String(value || '').trim().toLowerCase();
  const canonical = String(key || '').trim().toLowerCase();
  return !name || name === canonical || /^[0-9a-f]{24,64}$/.test(name);
}

export function evaluateAvatarPublication(avatar: Avatar): PublicationDecision {
  const reasons: PublicationReasonCode[] = [];
  if (avatar.nameStatus === 'unresolved' || avatar.name === null) {
    reasons.push('AVATAR_NAME_UNRESOLVED');
  }
  if (avatar.thumbnailAssetId === null) {
    reasons.push('AVATAR_PORTRAIT_MISSING');
  }
  return { entityKind: 'avatar', eligible: reasons.length === 0, reasons };
}

export function evaluateItemPublication(item: ItemDefinition): PublicationDecision {
  const reasons: PublicationReasonCode[] = [];
  if (item.xmlRarity !== 'rare' && item.xmlRarity !== 'legendary') {
    reasons.push('ITEM_NOT_XML_RARE_OR_LEGENDARY');
  }
  if (item.iconAssetId === null) reasons.push('ITEM_ICON_MISSING');
  return {
    entityKind: 'item',
    eligible: isPublicCatalogEligible(item),
    reasons
  };
}

export function evaluateSpacePublication(space: Space): PublicationDecision {
  const reasons: PublicationReasonCode[] = [];
  if (isEchoedCanonicalId(space.displayName, space.spaceId)) reasons.push('SPACE_NAME_UNRESOLVED');
  if (space.snapshotAssetId === null) reasons.push('SPACE_SNAPSHOT_MISSING');
  return { entityKind: 'space', eligible: reasons.length === 0, reasons };
}
