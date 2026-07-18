import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '@smallverse/database';

type ReconciliationJob = {
  id: string;
  kind: 'avatar-identity' | 'avatar-config' | 'avatar-render' | 'uid-variant-render' | 'space-identity';
  canonicalKey: string;
};

/**
 * Bounded, database-only reconciliation for the evidence pipeline.
 *
 * This worker deliberately does not drive the game client, make Smallverse
 * network calls, launch a browser, or invoke the renderer. Those actions are
 * capture operations and must remain explicit, rate-limited services. Its job
 * is only to close queue records once the matching canonical evidence exists.
 */
export class CanonicalReconciliationWorker {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async reconcileOne(): Promise<{ outcome: 'idle' | 'waiting' | 'completed'; kind?: string; canonicalKey?: string }> {
    const job = await this.leaseNext();
    if (!job) return { outcome: 'idle' };

    const complete = await this.hasRequiredEvidence(job);
    if (complete) {
      await this.db.updateTable('enrichmentJobs')
        .set({ status: 'completed', lastError: null, updatedAt: sql`now()` })
        .where('id', '=', job.id)
        .where('status', '=', 'leased')
        .execute();
      return { outcome: 'completed', kind: job.kind, canonicalKey: job.canonicalKey };
    }

    // Requeue without busy-waiting. A fresh immutable capture or renderer
    // receipt is required before this can become complete.
    await this.db.updateTable('enrichmentJobs')
      .set({ status: 'queued', updatedAt: sql`now()` })
      .where('id', '=', job.id)
      .where('status', '=', 'leased')
      .execute();
    return { outcome: 'waiting', kind: job.kind, canonicalKey: job.canonicalKey };
  }

  private async leaseNext(): Promise<ReconciliationJob | null> {
    // One record per tick keeps the service cheap on a VPS. The conditional
    // update prevents a second worker from processing a row already leased.
    const candidate = await this.db.selectFrom('enrichmentJobs')
      .select(['id', 'kind', 'canonicalKey'])
      .where('status', '=', 'queued')
      .orderBy('priority')
      .orderBy('createdAt')
      .limit(1)
      .executeTakeFirst();
    if (!candidate) return null;

    const leased = await this.db.updateTable('enrichmentJobs')
      .set({ status: 'leased', attempts: sql`attempts + 1`, updatedAt: sql`now()` })
      .where('id', '=', candidate.id)
      .where('status', '=', 'queued')
      .executeTakeFirst();
    return Number(leased.numUpdatedRows) === 1 ? candidate : null;
  }

  private async hasRequiredEvidence(job: Pick<ReconciliationJob, 'kind' | 'canonicalKey'>): Promise<boolean> {
    switch (job.kind) {
      case 'avatar-identity':
        return this.isPublished('avatar', job.canonicalKey);
      case 'space-identity':
        return this.isPublished('space', job.canonicalKey);
      case 'avatar-config': {
        const row = await this.db.selectFrom('avatarConfigSnapshots')
          .select('avatarId')
          .where('avatarId', '=', job.canonicalKey)
          .where('captureGenerationKey', 'is not', null)
          .limit(1)
          .executeTakeFirst();
        return Boolean(row);
      }
      case 'avatar-render': {
        const row = await this.db.selectFrom('rendererParityResults')
          .select('id')
          .where('entityKind', '=', 'avatar')
          .where('canonicalKey', '=', job.canonicalKey)
          .where('status', '=', 'matched')
          .limit(1)
          .executeTakeFirst();
        return Boolean(row);
      }
      case 'uid-variant-render': {
        const row = await this.db.selectFrom('uidVariantRenders')
          .select('uid')
          .where('uid', '=', job.canonicalKey)
          .where('status', '=', 'rendered')
          .limit(1)
          .executeTakeFirst();
        return Boolean(row);
      }
    }
    return false;
  }

  private async isPublished(entityKind: 'avatar' | 'space', canonicalKey: string): Promise<boolean> {
    const row = await this.db.selectFrom('publicationDecisions')
      .select('eligible')
      .where('entityKind', '=', entityKind)
      .where('canonicalKey', '=', canonicalKey)
      .executeTakeFirst();
    return row?.eligible === true;
  }
}
