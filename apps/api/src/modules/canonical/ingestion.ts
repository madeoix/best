import { sql, type Kysely, type Transaction } from 'kysely';
import type { DatabaseSchema } from '@smallverse/database';
import {
  evaluateAvatarPublication,
  evaluateItemPublication,
  evaluateSpacePublication,
  type Avatar,
  type ItemDefinition,
  type OwnerAvatarRelationship,
  type Space
} from '@smallverse/contracts';

type Db = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

/** Canonical write boundary. Capture importers call this; public routes never parse exports. */
export class CanonicalIngestionService {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async ingestAvatar(avatar: Avatar, edge?: OwnerAvatarRelationship): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const existing = await tx.selectFrom('avatars').select(['ownerId'])
        .where('avatarId', '=', avatar.avatarId).executeTakeFirst();
      if (existing?.ownerId && avatar.ownerId && existing.ownerId !== avatar.ownerId) {
        throw new Error(`Canonical owner conflict for avatar ${avatar.avatarId}`);
      }
      if (avatar.ownerId) {
        await tx.insertInto('ownerAccounts').values({ ownerId: avatar.ownerId, firstObservedAt: avatar.firstObservedAt, lastObservedAt: avatar.lastObservedAt })
          .onConflict((oc) => oc.column('ownerId').doUpdateSet({ lastObservedAt: avatar.lastObservedAt })).execute();
      }
      await tx.insertInto('avatars').values(avatar)
        .onConflict((oc) => oc.column('avatarId').doUpdateSet({
          ownerId: avatar.ownerId, name: avatar.name, nameStatus: avatar.nameStatus,
          thumbnailAssetId: avatar.thumbnailAssetId, lastObservedAt: avatar.lastObservedAt
        })).execute();
      if (edge) await tx.insertInto('ownerAvatarRelationships').values({
        ownerId: edge.ownerId, avatarId: edge.avatarId,
        evidenceKind: edge.evidenceKind, observedAt: edge.observedAt,
        sourceKey: edge.provenance.sourceKey, captureId: edge.provenance.captureId,
        crawlerId: edge.provenance.crawlerId,
        evidenceSha256: edge.provenance.evidenceSha256
      }).onConflict((oc) => oc.columns(['ownerId', 'avatarId', 'evidenceSha256']).doNothing()).execute();
      await this.publish(tx, avatar.avatarId, evaluateAvatarPublication(avatar));
      if (!avatar.name || !avatar.thumbnailAssetId) await this.queue(tx, 'avatar-identity', avatar.avatarId, 'Canonical avatar identity is incomplete.');
      await this.queue(tx, 'avatar-config', avatar.avatarId, 'Acquire authoritative equipped configuration.');
    });
  }

  async ingestSpace(space: Space): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await tx.insertInto('spaces').values(space).onConflict((oc) => oc.column('spaceId').doUpdateSet({
        displayName: space.displayName, ownerId: space.ownerId, snapshotAssetId: space.snapshotAssetId, lastObservedAt: space.lastObservedAt
      })).execute();
      await this.publish(tx, space.spaceId, evaluateSpacePublication(space));
      if (!space.displayName || !space.snapshotAssetId) await this.queue(tx, 'space-identity', space.spaceId, 'Space name or snapshot is incomplete.');
    });
  }

  async ingestItem(item: ItemDefinition & { definitionSha256: string }): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await tx.insertInto('itemDefinitions').values(item).onConflict((oc) => oc.column('sourceXml').doUpdateSet({
        displayName: item.displayName, category: item.category, xmlRarity: item.xmlRarity,
        iconAssetId: item.iconAssetId, definitionSha256: item.definitionSha256
      })).execute();
      await this.publish(tx, item.sourceXml, evaluateItemPublication(item));
    });
  }

  private async publish(tx: Db, key: string, decision: ReturnType<typeof evaluateAvatarPublication>): Promise<void> {
    await tx.insertInto('publicationDecisions').values({ canonicalKey: key, ...decision })
      .onConflict((oc) => oc.columns(['entityKind', 'canonicalKey']).doUpdateSet({ eligible: decision.eligible, reasons: decision.reasons, evaluatedAt: sql`now()` })).execute();
  }

  private async queue(tx: Db, kind: 'avatar-identity' | 'avatar-config' | 'space-identity', key: string, reason: string): Promise<void> {
    await tx.insertInto('enrichmentJobs').values({ kind, canonicalKey: key, sourceGenerationId: null, reason, status: 'queued' })
      .onConflict((oc) => oc.columns(['kind', 'canonicalKey', 'status']).doNothing()).execute();
  }
}
