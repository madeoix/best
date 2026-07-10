import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable
} from 'kysely';

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface SourceTable {
  id: Generated<string>;
  sourceKey: string;
  displayName: string;
  sourceType: string;
  baseUri: string | null;
  trustPriority: number;
  enabled: boolean;
  notes: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

export interface EntityTable {
  id: Generated<string>;
  kind: 'item' | 'person' | 'avatar' | 'space' | 'collection';
  canonicalKey: string;
  slug: string;
  displayName: string;
  summary: string | null;
  visibility: 'public' | 'unlisted' | 'restricted' | 'hidden';
  confidence: number;
  metadata: unknown;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

export interface BlobTable {
  sha256: string;
  storageKey: string;
  byteSize: string;
  mediaType: string;
  verifiedAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
}

export interface AssetTable {
  id: Generated<string>;
  blobSha256: string;
  assetKind: string;
  visibility: 'public' | 'unlisted' | 'restricted' | 'hidden';
  originalFilename: string | null;
  rightsStatement: string | null;
  metadata: unknown;
  createdAt: Generated<Timestamp>;
}

export interface JobTable {
  id: Generated<string>;
  jobType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead';
  payload: unknown;
  result: unknown | null;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: Timestamp;
  lockedAt: Timestamp | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Generated<Timestamp>;
  finishedAt: Timestamp | null;
}

export interface OperatorTokenTable {
  id: Generated<string>;
  label: string;
  tokenPrefix: string;
  tokenDigest: string;
  scopes: string[];
  createdAt: Generated<Timestamp>;
  expiresAt: Timestamp | null;
  lastUsedAt: Timestamp | null;
  revokedAt: Timestamp | null;
}

export interface AuditEventTable {
  id: Generated<string>;
  occurredAt: Generated<Timestamp>;
  requestId: string;
  actorTokenId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  inputSummary: unknown;
  result: string;
  remoteAddress: string | null;
}

export interface DatabaseSchema {
  sources: SourceTable;
  entities: EntityTable;
  blobs: BlobTable;
  assets: AssetTable;
  jobs: JobTable;
  operatorTokens: OperatorTokenTable;
  auditEvents: AuditEventTable;
}

export type Source = Selectable<SourceTable>;
export type NewSource = Insertable<SourceTable>;
export type Entity = Selectable<EntityTable>;
export type NewEntity = Insertable<EntityTable>;
export type Job = Selectable<JobTable>;
export type NewJob = Insertable<JobTable>;
export type JobPatch = Updateable<JobTable>;
