export type RendererParityStatus = 'pending' | 'matched' | 'mismatch' | 'insufficient-evidence';

export interface RendererParityEvidence {
  entityKind: 'avatar' | 'uid-variant';
  canonicalKey: string;
  sourceConfigSha256: string;
  renderedAssetId: string | null;
  capturedReferenceAssetId: string | null;
  pixelDifferenceRatio: number | null;
  status: RendererParityStatus;
  verifiedAt: string | null;
}

export function parityStatus(
  renderedAssetId: string | null,
  capturedReferenceAssetId: string | null,
  pixelDifferenceRatio: number | null,
  tolerance = 0.01
): RendererParityStatus {
  if (!renderedAssetId || !capturedReferenceAssetId || pixelDifferenceRatio === null) {
    return 'insufficient-evidence';
  }
  return pixelDifferenceRatio <= tolerance ? 'matched' : 'mismatch';
}
