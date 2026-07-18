export type CrawlerRole = 'world-observer' | 'avatar-enricher';

export interface CrawlerRoleDefinition {
  account: 'crawler-01' | 'crawler-02';
  role: CrawlerRole;
  captures: readonly string[];
  mustNotInfer: readonly string[];
}

export const CRAWLER_ROLES: readonly CrawlerRoleDefinition[] = [
  {
    account: 'crawler-01',
    role: 'world-observer',
    captures: ['popular-space-receipts', 'space-identity', 'object-uids', 'placed-items', 'sale-listings', 'present-avatars'],
    mustNotInfer: ['equipped-items-from-room-objects', 'primary-avatar-from-first-result']
  },
  {
    account: 'crawler-02',
    role: 'avatar-enricher',
    captures: ['owner-avatar-membership', 'avatar-name', 'avatar-thumbnail', 'avatar-config', 'selected-avatar-evidence'],
    mustNotInfer: ['owner-from-display-name', 'default-avatar-without-selected/default-evidence']
  }
] as const;

export type EnrichmentJobKind =
  | 'avatar-identity'
  | 'avatar-config'
  | 'avatar-render'
  | 'uid-variant-render'
  | 'space-identity';

export interface EnrichmentJobRequest {
  kind: EnrichmentJobKind;
  canonicalKey: string;
  sourceGenerationId: string;
  priority: number;
  reason: string;
}
