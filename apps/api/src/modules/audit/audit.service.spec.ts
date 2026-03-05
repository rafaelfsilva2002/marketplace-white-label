import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditService } from './audit.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../common/interceptors/correlation-id.interceptor', () => ({
  getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
  correlationStorage: new AsyncLocalStorage(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedInsert() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

const FAKE_AUDIT_ENTRY = {
  userId: 'user-1',
  action: 'profile.updated',
  entityType: 'profile',
  entityId: 'profile-1',
  oldValue: { name: 'Old Name' },
  newValue: { name: 'New Name' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  metadata: { source: 'web' },
  correlationId: 'custom-correlation-id',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      insert: vi.fn(),
    };

    service = new AuditService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // record
  // -------------------------------------------------------------------------

  describe('record', () => {
    it('should insert an audit log entry into the database', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());

      await service.record(FAKE_AUDIT_ENTRY);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should use the provided correlationId when present', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.record(FAKE_AUDIT_ENTRY);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'custom-correlation-id',
        }),
      );
    });

    it('should use getCorrelationId when correlationId is not in the entry', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      const entryWithoutCorrelation = {
        action: 'login.success',
        entityType: 'auth',
        userId: 'user-1',
      };

      await service.record(entryWithoutCorrelation);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-correlation-id',
        }),
      );
    });

    it('should pass all fields to the insert values', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.record(FAKE_AUDIT_ENTRY);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'profile.updated',
          entityType: 'profile',
          entityId: 'profile-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { source: 'web' },
        }),
      );
    });

    it('should rethrow errors from the database', async () => {
      const dbError = new Error('Connection refused');
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(dbError),
      });

      await expect(service.record(FAKE_AUDIT_ENTRY)).rejects.toThrow(
        'Connection refused',
      );
    });

    it('should handle entry with minimal fields', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.record({
        action: 'test.action',
        entityType: 'test',
      });

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'test.action',
          entityType: 'test',
          correlationId: 'test-correlation-id',
        }),
      );
    });

    it('should pass undefined oldValue and newValue through as-is', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.record({
        action: 'entity.deleted',
        entityType: 'profile',
        oldValue: undefined,
        newValue: undefined,
      });

      const callArgs = insertMock.values.mock.calls[0][0];
      expect(callArgs.action).toBe('entity.deleted');
      expect(callArgs.entityType).toBe('profile');
      // TypeScript cast does not convert undefined to null at runtime
      expect(callArgs.oldValue).toBeUndefined();
      expect(callArgs.newValue).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // recordBatch
  // -------------------------------------------------------------------------

  describe('recordBatch', () => {
    it('should insert multiple audit entries at once', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.recordBatch([
        { action: 'a.one', entityType: 'test' },
        { action: 'a.two', entityType: 'test' },
      ]);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ action: 'a.one' }),
          expect.objectContaining({ action: 'a.two' }),
        ]),
      );
    });

    it('should assign correlationId from getCorrelationId to each entry', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.recordBatch([
        { action: 'batch.one', entityType: 'test' },
      ]);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ correlationId: 'test-correlation-id' }),
        ]),
      );
    });

    it('should preserve individual correlationIds when provided', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.recordBatch([
        { action: 'batch.one', entityType: 'test', correlationId: 'custom-1' },
      ]);

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ correlationId: 'custom-1' }),
        ]),
      );
    });

    it('should rethrow database errors from batch insert', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Batch insert failed')),
      });

      await expect(
        service.recordBatch([
          { action: 'fail.test', entityType: 'test' },
        ]),
      ).rejects.toThrow('Batch insert failed');
    });
  });
});
