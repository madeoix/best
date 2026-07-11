import { createDatabase } from '@smallverse/database';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/errors.js';

export interface AuditRecord {
  action: string;
  targetType?: string;
  targetId?: string;
  inputSummary?: Record<string, unknown>;
  result: 'succeeded' | 'failed' | 'rejected';
  error?: string;
}

export interface OperatorAudit {
  record(
    request: FastifyRequest,
    record: AuditRecord
  ): Promise<void>;
  list(limit: number): Promise<unknown[]>;
}

export class OperatorAuditLog implements OperatorAudit {
  constructor(
    private readonly database: ReturnType<typeof createDatabase> | undefined,
    private readonly logger: FastifyBaseLogger
  ) {}

  async record(
    request: FastifyRequest,
    record: AuditRecord
  ): Promise<void> {
    const payload = {
      ...record.inputSummary,
      actor: request.operatorActor?.label ?? 'unknown',
      tokenPrefix: request.operatorActor?.tokenPrefix ?? null,
      scopes: request.operatorActor?.scopes ?? [],
      ...(record.error ? { error: record.error } : {})
    };

    this.logger.info({
      audit: {
        requestId: request.id,
        remoteAddress: request.ip,
        ...record,
        inputSummary: payload
      }
    }, 'Operator audit event');

    if (!this.database) {
      return;
    }

    try {
      await this.database
        .insertInto('auditEvents')
        .values({
          requestId: request.id,
          actorTokenId: null,
          action: record.action,
          targetType: record.targetType ?? null,
          targetId: record.targetId ?? null,
          inputSummary: payload,
          result: record.result,
          remoteAddress: request.ip
        })
        .execute();
    } catch (error) {
      this.logger.error(
        { err: error, requestId: request.id },
        'Could not persist operator audit event'
      );
    }
  }

  async list(limit: number): Promise<unknown[]> {
    if (!this.database) {
      throw new HttpError(
        503,
        'AUDIT_DATABASE_UNAVAILABLE',
        'Operator audit history requires a configured database.'
      );
    }

    try {
      return await this.database
        .selectFrom('auditEvents')
        .select([
          'id',
          'occurredAt',
          'requestId',
          'action',
          'targetType',
          'targetId',
          'inputSummary',
          'result',
          'remoteAddress'
        ])
        .orderBy('occurredAt', 'desc')
        .limit(limit)
        .execute();
    } catch (error) {
      throw new HttpError(
        503,
        'AUDIT_DATABASE_UNAVAILABLE',
        'Operator audit history is temporarily unavailable.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
