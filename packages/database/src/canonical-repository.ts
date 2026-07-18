import type { Kysely } from 'kysely';
import type { DatabaseSchema } from './types.js';

export class CanonicalRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async avatar(avatarId: string) {
    const avatar = await this.db.selectFrom('avatars')
      .leftJoin('assets', 'assets.id', 'avatars.thumbnailAssetId')
      .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .select([
        'avatars.avatarId', 'avatars.ownerId', 'avatars.name',
        'avatars.nameStatus', 'avatars.firstObservedAt', 'avatars.lastObservedAt',
        'avatars.thumbnailAssetId', 'blobs.storageKey as thumbnailStorageKey'
      ])
      .where('avatars.avatarId', '=', avatarId)
      .executeTakeFirst();
    if (!avatar) return null;

    const [account, siblings, spaces, relationships, snapshots, publication] =
      await Promise.all([
        avatar.ownerId
          ? this.account(avatar.ownerId)
          : Promise.resolve(null),
        avatar.ownerId
          ? this.db.selectFrom('ownerAvatarRelationships')
              .innerJoin('avatars', 'avatars.avatarId', 'ownerAvatarRelationships.avatarId')
              .innerJoin('publicationDecisions as siblingPublication', (join) => join
                .onRef('siblingPublication.canonicalKey', '=', 'avatars.avatarId')
                .on('siblingPublication.entityKind', '=', 'avatar')
                .on('siblingPublication.eligible', '=', true))
              .leftJoin('assets as siblingAssets', 'siblingAssets.id', 'avatars.thumbnailAssetId')
              .leftJoin('blobs as siblingBlobs', 'siblingBlobs.sha256', 'siblingAssets.blobSha256')
              .select([
                'avatars.avatarId', 'avatars.name', 'avatars.nameStatus',
                'avatars.thumbnailAssetId', 'ownerAvatarRelationships.evidenceKind',
                'ownerAvatarRelationships.observedAt',
                'siblingBlobs.storageKey as thumbnailStorageKey'
              ])
              .where('ownerAvatarRelationships.ownerId', '=', avatar.ownerId)
              .orderBy('ownerAvatarRelationships.observedAt', 'desc')
              .execute()
          : Promise.resolve([]),
        this.db.selectFrom('avatarSpaceObservations')
          .innerJoin('spaces', 'spaces.spaceId', 'avatarSpaceObservations.spaceId')
          .innerJoin('publicationDecisions as spacePublication', (join) => join
            .onRef('spacePublication.canonicalKey', '=', 'spaces.spaceId')
            .on('spacePublication.entityKind', '=', 'space')
            .on('spacePublication.eligible', '=', true))
          .leftJoin('assets', 'assets.id', 'spaces.snapshotAssetId')
          .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
          .select([
            'spaces.spaceId', 'spaces.displayName', 'spaces.ownerId',
            'spaces.snapshotAssetId', 'blobs.storageKey as snapshotStorageKey',
            'avatarSpaceObservations.observedAt'
          ])
          .where('avatarSpaceObservations.avatarId', '=', avatarId)
          .orderBy('avatarSpaceObservations.observedAt', 'desc')
          .execute(),
        this.db.selectFrom('temporalObservations')
          .innerJoin('itemDefinitions',
            'itemDefinitions.sourceXml',
            'temporalObservations.itemDefinitionSourceXml')
          .selectAll('temporalObservations')
          .select([
            'itemDefinitions.displayName as itemDisplayName',
            'itemDefinitions.xmlRarity', 'itemDefinitions.iconAssetId'
          ])
          .where('temporalObservations.avatarId', '=', avatarId)
          .orderBy('temporalObservations.observedAt', 'desc')
          .execute(),
        this.db.selectFrom('avatarConfigSnapshots')
          // A profile page needs to know whether a captured configuration
          // exists; it must never receive the raw capture payload.  The raw
          // XML/config remains an internal renderer input, not a public API
          // response or a browser-side source of truth.
          .select([
            'snapshotId', 'avatarId', 'captureGenerationKey', 'capturedAt',
            'configSha256', 'sourceCaptureId'
          ])
          .where('avatarId', '=', avatarId)
          .orderBy('capturedAt', 'desc')
          .execute(),
        this.publication('avatar', avatarId)
      ]);

    // A public avatar profile only contains exact, typed relationships.  Raw
    // IDs and incomplete locations remain internal capture evidence.
    const publicRelationships = relationships.filter((row) => Boolean(row.itemDisplayName));
    return { avatar, account, siblings, spaces, relationships: publicRelationships, snapshots, publication };
  }

  async account(ownerId: string) {
    const account = await this.db.selectFrom('ownerAccounts')
      .selectAll().where('ownerId', '=', ownerId).executeTakeFirst();
    if (!account) return null;
    const avatars = await this.db.selectFrom('ownerAvatarRelationships')
      .innerJoin('avatars', 'avatars.avatarId', 'ownerAvatarRelationships.avatarId')
      .select([
        'avatars.avatarId', 'avatars.name', 'avatars.nameStatus',
        'avatars.thumbnailAssetId', 'ownerAvatarRelationships.evidenceKind',
        'ownerAvatarRelationships.observedAt',
        'ownerAvatarRelationships.evidenceSha256'
      ])
      .where('ownerAvatarRelationships.ownerId', '=', ownerId)
      .orderBy('ownerAvatarRelationships.observedAt', 'desc')
      .execute();
    return { ...account, avatars };
  }

  async item(sourceXml: string) {
    const item = await this.db.selectFrom('itemDefinitions')
      .leftJoin('assets', 'assets.id', 'itemDefinitions.iconAssetId')
      .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .selectAll('itemDefinitions')
      .select('blobs.storageKey as iconStorageKey')
      .where('itemDefinitions.sourceXml', '=', sourceXml)
      .executeTakeFirst();
    if (!item) return null;
    const [instanceCount, observations, variants, publication] = await Promise.all([
      // UIDs are an internal identity. Public item profiles need the count,
      // while the selected variant UID remains available only in the explicit
      // technical-evidence disclosure.
      this.db.selectFrom('itemInstances').select(({ fn }) => fn.countAll().as('count'))
        .where('itemDefinitionSourceXml', '=', sourceXml)
        .executeTakeFirstOrThrow(),
      // A temporal observation is the relationship record.  Join its
      // canonical identity/location here so public consumers never have to
      // turn raw avatar or space IDs into labels on their own.
      this.db.selectFrom('temporalObservations')
        .leftJoin('avatars', 'avatars.avatarId', 'temporalObservations.avatarId')
        .leftJoin('assets as avatarAssets', 'avatarAssets.id', 'avatars.thumbnailAssetId')
        .leftJoin('blobs as avatarBlobs', 'avatarBlobs.sha256', 'avatarAssets.blobSha256')
        .leftJoin('publicationDecisions as avatarPublication', (join) => join
          .onRef('avatarPublication.canonicalKey', '=', 'avatars.avatarId')
          .on('avatarPublication.entityKind', '=', 'avatar')
          .on('avatarPublication.eligible', '=', true))
        .leftJoin('spaces', 'spaces.spaceId', 'temporalObservations.spaceId')
        .leftJoin('assets as spaceAssets', 'spaceAssets.id', 'spaces.snapshotAssetId')
        .leftJoin('blobs as spaceBlobs', 'spaceBlobs.sha256', 'spaceAssets.blobSha256')
        .leftJoin('publicationDecisions as spacePublication', (join) => join
          .onRef('spacePublication.canonicalKey', '=', 'spaces.spaceId')
          .on('spacePublication.entityKind', '=', 'space')
          .on('spacePublication.eligible', '=', true))
        .selectAll('temporalObservations')
        .select([
          'avatars.name as avatarName',
          'avatars.nameStatus as avatarNameStatus',
          'avatarBlobs.storageKey as avatarThumbnailStorageKey',
          'avatarPublication.eligible as avatarEligible',
          'spaces.displayName as spaceDisplayName',
          'spaceBlobs.storageKey as spaceSnapshotStorageKey',
          'spacePublication.eligible as spaceEligible'
        ])
        .where('temporalObservations.itemDefinitionSourceXml', '=', sourceXml)
        .orderBy('temporalObservations.observedAt', 'desc').execute(),
      this.db.selectFrom('uidVariantRenders')
        .leftJoin('assets', 'assets.id', 'uidVariantRenders.renderedAssetId')
        .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
        .selectAll('uidVariantRenders')
        .select('blobs.storageKey as renderedStorageKey')
        .where('itemDefinitionSourceXml', '=', sourceXml)
        .orderBy('observedAt', 'desc').execute(),
      this.publication('item', sourceXml)
    ]);
    // The public read model must not ask the browser to repair incomplete
    // joins.  Equipment requires a publishable identity; placed/listed
    // evidence requires a publishable location.  Rows that fail those
    // checks remain capture evidence in Ops rather than becoming blank UI.
    const publicObservations = observations.filter((row) => {
      if (row.relationship === 'equipped') {
        return Boolean(row.avatarEligible && row.avatarName && row.avatarThumbnailStorageKey);
      }
      return Boolean(row.spaceEligible && row.spaceDisplayName && row.spaceSnapshotStorageKey);
    });

    return {
      item,
      instanceCount: Number(instanceCount.count),
      variants,
      observations: {
        equipped: publicObservations.filter((row) => row.relationship === 'equipped'),
        placed: publicObservations.filter((row) => row.relationship === 'placed'),
        listedForSale: publicObservations.filter((row) => row.relationship === 'listed-for-sale')
      },
      publication
    };
  }

  async space(spaceId: string) {
    const space = await this.db.selectFrom('spaces')
      .leftJoin('assets', 'assets.id', 'spaces.snapshotAssetId')
      .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .selectAll('spaces')
      .select('blobs.storageKey as snapshotStorageKey')
      .where('spaces.spaceId', '=', spaceId)
      .executeTakeFirst();
    if (!space) return null;
    const [observations, publication] = await Promise.all([
      this.db.selectFrom('temporalObservations')
        .innerJoin('itemDefinitions',
          'itemDefinitions.sourceXml',
          'temporalObservations.itemDefinitionSourceXml')
        .leftJoin('assets as itemAssets', 'itemAssets.id', 'itemDefinitions.iconAssetId')
        .leftJoin('blobs as itemBlobs', 'itemBlobs.sha256', 'itemAssets.blobSha256')
        .selectAll('temporalObservations')
        .select([
          'itemDefinitions.displayName as itemDisplayName',
          'itemDefinitions.xmlRarity',
          'itemDefinitions.iconAssetId',
          'itemBlobs.storageKey as itemIconStorageKey'
        ])
        .where('temporalObservations.spaceId', '=', spaceId)
        .orderBy('temporalObservations.observedAt', 'desc').execute(),
      this.publication('space', spaceId)
    ]);
    return {
      space,
      observations: {
        placed: observations.filter((row) => row.relationship === 'placed'),
        listedForSale: observations.filter((row) => row.relationship === 'listed-for-sale')
      },
      publication
    };
  }

  async searchPublicItems(query: string, limit: number) {
    let statement = this.db.selectFrom('itemDefinitions')
      .innerJoin('publicationDecisions', (join) => join
        .onRef('publicationDecisions.canonicalKey', '=', 'itemDefinitions.sourceXml')
        .on('publicationDecisions.entityKind', '=', 'item')
        .on('publicationDecisions.eligible', '=', true))
      .leftJoin('assets', 'assets.id', 'itemDefinitions.iconAssetId')
      .leftJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .selectAll('itemDefinitions')
      .select('blobs.storageKey as iconStorageKey')
      .select((eb) => [
        eb.selectFrom('itemInstances')
          .select(({ fn }) => fn.countAll().as('count'))
          .whereRef('itemInstances.itemDefinitionSourceXml', '=', 'itemDefinitions.sourceXml')
          .as('instanceCount'),
        eb.selectFrom('uidVariantRenders')
          .select(({ fn }) => fn.countAll().as('count'))
          .whereRef('uidVariantRenders.itemDefinitionSourceXml', '=', 'itemDefinitions.sourceXml')
          .where('uidVariantRenders.status', '=', 'rendered')
          .as('renderedVariantCount'),
        eb.selectFrom('temporalObservations')
          .select(({ fn }) => fn.count('avatarId').distinct().as('count'))
          .whereRef('temporalObservations.itemDefinitionSourceXml', '=', 'itemDefinitions.sourceXml')
          .where('temporalObservations.avatarId', 'is not', null)
          .as('avatarCount'),
        eb.selectFrom('temporalObservations')
          .select(({ fn }) => fn.count('spaceId').distinct().as('count'))
          .whereRef('temporalObservations.itemDefinitionSourceXml', '=', 'itemDefinitions.sourceXml')
          .where('temporalObservations.spaceId', 'is not', null)
          .as('spaceCount')
      ])
      .limit(limit);
    if (query.trim()) {
      statement = statement.where((eb) => eb.or([
        eb('itemDefinitions.displayName', 'ilike', `%${query.trim()}%`),
        eb('itemDefinitions.sourceXml', 'ilike', `%${query.trim()}%`)
      ]));
    }
    return statement.orderBy('itemDefinitions.displayName').execute();
  }

  async publicAvatars(query: string, limit: number) {
    let statement = this.db.selectFrom('avatars')
      .innerJoin('publicationDecisions', (join) => join
        .onRef('publicationDecisions.canonicalKey', '=', 'avatars.avatarId')
        .on('publicationDecisions.entityKind', '=', 'avatar')
        .on('publicationDecisions.eligible', '=', true))
      .innerJoin('assets', 'assets.id', 'avatars.thumbnailAssetId')
      .innerJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .select([
        'avatars.avatarId', 'avatars.ownerId', 'avatars.name', 'avatars.nameStatus',
        'avatars.firstObservedAt', 'avatars.lastObservedAt',
        'blobs.storageKey as thumbnailStorageKey'
      ])
      .limit(limit);
    if (query.trim()) {
      statement = statement.where('avatars.name', 'ilike', `%${query.trim()}%`);
    }
    return statement.orderBy('avatars.name').execute();
  }

  async publicSpaces(query: string, limit: number) {
    let statement = this.db.selectFrom('spaces')
      .innerJoin('publicationDecisions', (join) => join
        .onRef('publicationDecisions.canonicalKey', '=', 'spaces.spaceId')
        .on('publicationDecisions.entityKind', '=', 'space')
        .on('publicationDecisions.eligible', '=', true))
      .innerJoin('assets', 'assets.id', 'spaces.snapshotAssetId')
      .innerJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .select([
        'spaces.spaceId', 'spaces.ownerId', 'spaces.displayName',
        'spaces.firstObservedAt', 'spaces.lastObservedAt',
        'blobs.storageKey as snapshotStorageKey'
      ])
      .select((eb) => [
        eb.selectFrom('temporalObservations')
          .select(({ fn }) => fn.countAll().as('count'))
          .whereRef('temporalObservations.spaceId', '=', 'spaces.spaceId')
          .as('itemSignalCount'),
        eb.selectFrom('avatarSpaceObservations')
          .select(({ fn }) => fn.count('avatarId').distinct().as('count'))
          .whereRef('avatarSpaceObservations.spaceId', '=', 'spaces.spaceId')
          .as('avatarCount')
      ])
      .whereRef('spaces.displayName', '!=', 'spaces.spaceId')
      .limit(limit);
    if (query.trim()) {
      statement = statement.where('spaces.displayName', 'ilike', `%${query.trim()}%`);
    }
    return statement.orderBy('spaces.displayName').execute();
  }

  /**
   * This is deliberately narrower than the public avatar index.  A row is
   * emitted only when an immutable avatar-config snapshot exists and the
   * identity has independently passed public publication.  It prevents Ops
   * from presenting a portrait inventory as a "live crawler" feed.
   */
  async capturedPublicAvatars(limit: number) {
    const rows = await this.db.selectFrom('avatarConfigSnapshots')
      .innerJoin('avatars', 'avatars.avatarId', 'avatarConfigSnapshots.avatarId')
      .innerJoin('publicationDecisions', (join) => join
        .onRef('publicationDecisions.canonicalKey', '=', 'avatars.avatarId')
        .on('publicationDecisions.entityKind', '=', 'avatar')
        .on('publicationDecisions.eligible', '=', true))
      .innerJoin('assets', 'assets.id', 'avatars.thumbnailAssetId')
      .innerJoin('blobs', 'blobs.sha256', 'assets.blobSha256')
      .leftJoin('captureGenerations', 'captureGenerations.generationKey', 'avatarConfigSnapshots.captureGenerationKey')
      .select([
        'avatars.avatarId', 'avatars.name', 'avatars.nameStatus',
        'blobs.storageKey as thumbnailStorageKey',
        'avatarConfigSnapshots.snapshotId', 'avatarConfigSnapshots.capturedAt',
        'avatarConfigSnapshots.configSha256',
        'captureGenerations.crawlerId', 'captureGenerations.generationKey'
      ])
      .where('avatarConfigSnapshots.captureGenerationKey', 'is not', null)
      .orderBy('avatarConfigSnapshots.capturedAt', 'desc')
      .limit(Math.max(1, Math.min(limit, 200)))
      .execute();

    // Multiple snapshots for the same avatar are useful renderer history,
    // but a live feed should show the latest receipt once.
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.avatarId)) return false;
      seen.add(row.avatarId);
      return true;
    });
  }

  async publicStatus() {
    const [items, avatars, spaces, instances, variants, snapshots, equipped, avatarSpaces, generation] = await Promise.all([
      this.db.selectFrom('publicationDecisions').select(({ fn }) => fn.countAll().as('count'))
        .where('entityKind', '=', 'item').where('eligible', '=', true).executeTakeFirstOrThrow(),
      this.db.selectFrom('publicationDecisions').select(({ fn }) => fn.countAll().as('count'))
        .where('entityKind', '=', 'avatar').where('eligible', '=', true).executeTakeFirstOrThrow(),
      this.db.selectFrom('publicationDecisions').select(({ fn }) => fn.countAll().as('count'))
        .where('entityKind', '=', 'space').where('eligible', '=', true).executeTakeFirstOrThrow(),
      this.db.selectFrom('itemInstances').select(({ fn }) => fn.countAll().as('count')).executeTakeFirstOrThrow(),
      this.db.selectFrom('uidVariantRenders').select(({ fn }) => fn.countAll().as('count'))
        .where('status', '=', 'rendered').executeTakeFirstOrThrow(),
      this.db.selectFrom('avatarConfigSnapshots').select(({ fn }) => fn.countAll().as('count')).executeTakeFirstOrThrow(),
      this.db.selectFrom('temporalObservations').select(({ fn }) => fn.countAll().as('count'))
        .where('relationship', '=', 'equipped').executeTakeFirstOrThrow(),
      this.db.selectFrom('avatarSpaceObservations').select(({ fn }) => fn.countAll().as('count')).executeTakeFirstOrThrow(),
      this.db.selectFrom('captureGenerations').selectAll().orderBy('completedAt', 'desc').limit(1).executeTakeFirst()
    ]);
    return {
      counts: {
        items: Number(items.count), avatars: Number(avatars.count), spaces: Number(spaces.count),
        itemInstances: Number(instances.count), renderedVariants: Number(variants.count),
        avatarConfigSnapshots: Number(snapshots.count),
        exactEquippedObservations: Number(equipped.count),
        avatarSpaceObservations: Number(avatarSpaces.count)
      },
      latestGeneration: generation ?? null
    };
  }

  async pipelineMetrics() {
    const status = await this.publicStatus();
    const [queued, failed, parityMatched, parityMismatch] = await Promise.all([
      this.db.selectFrom('enrichmentJobs').select(({ fn }) => fn.countAll().as('count'))
        .where('status', '=', 'queued').executeTakeFirstOrThrow(),
      this.db.selectFrom('enrichmentJobs').select(({ fn }) => fn.countAll().as('count'))
        .where('status', '=', 'failed').executeTakeFirstOrThrow(),
      this.db.selectFrom('rendererParityResults').select(({ fn }) => fn.countAll().as('count'))
        .where('status', '=', 'matched').executeTakeFirstOrThrow(),
      this.db.selectFrom('rendererParityResults').select(({ fn }) => fn.countAll().as('count'))
        .where('status', '=', 'mismatch').executeTakeFirstOrThrow()
    ]);
    return {
      ...status,
      enrichment: { queued: Number(queued.count), failed: Number(failed.count) },
      rendererParity: { matched: Number(parityMatched.count), mismatch: Number(parityMismatch.count) }
    };
  }

  async publication(entityKind: 'avatar' | 'item' | 'space', canonicalKey: string) {
    return this.db.selectFrom('publicationDecisions').selectAll()
      .where('entityKind', '=', entityKind)
      .where('canonicalKey', '=', canonicalKey)
      .executeTakeFirst() ?? null;
  }

  async latestGenerations(limit = 20) {
    return this.db.selectFrom('captureGenerations').selectAll()
      .orderBy('completedAt', 'desc').limit(limit).execute();
  }

  async enrichmentBacklog(limit = 200) {
    return this.db.selectFrom('publicationDecisions').selectAll()
      .where('eligible', '=', false)
      .orderBy('evaluatedAt', 'desc').limit(limit).execute();
  }

  async enrichmentJobs(limit = 200) {
    return this.db.selectFrom('enrichmentJobs').selectAll()
      .orderBy('priority').orderBy('createdAt').limit(limit).execute();
  }

  async rendererStatus(limit = 200) {
    const [parity, variants] = await Promise.all([
      this.db.selectFrom('rendererParityResults').selectAll()
        .orderBy('createdAt', 'desc').limit(limit).execute(),
      this.db.selectFrom('uidVariantRenders').selectAll()
        .orderBy('updatedAt', 'desc').limit(limit).execute()
    ]);
    return { parity, variants };
  }
}
