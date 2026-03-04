import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlacklistService } from './blacklist.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_BLACKLIST_ENTRY = {
  id: 'bl-uuid-1',
  address: '0xbadactor1234567890abcdef1234567890abcdef',
  chain: 'ethereum',
  reason: 'Sanctioned address',
  addedBy: 'admin-uuid-1',
  isActive: true,
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlacklistService', () => {
  let service: BlacklistService;
  let mockDb: Record<string, any>;
  let mockAudit: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      insert: vi.fn(),
      update: vi.fn(),
      query: {
        amlBlacklists: {
          findMany: vi.fn(),
        },
      },
    };

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new BlacklistService(mockDb as any, mockAudit as any);
  });

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  describe('add', () => {
    it('should add an address to the blacklist', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([FAKE_BLACKLIST_ENTRY]),
        }),
      });

      const result = await service.add(
        '0xBadActor1234567890abcdef1234567890abcdef',
        'Sanctioned address',
        'admin-uuid-1',
        'ethereum',
      );

      expect(result).toEqual(FAKE_BLACKLIST_ENTRY);
      expect(result.isActive).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should lowercase the address before storing', async () => {
      let capturedValues: any;
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((vals: any) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([FAKE_BLACKLIST_ENTRY]),
          };
        }),
      });

      await service.add(
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        'Test',
        'admin-uuid-1',
      );

      expect(capturedValues.address).toBe(
        '0xabcdef1234567890abcdef1234567890abcdef12',
      );
    });

    it('should record an audit entry after adding', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([FAKE_BLACKLIST_ENTRY]),
        }),
      });

      await service.add(
        '0xBadActor1234567890abcdef1234567890abcdef',
        'Sanctioned address',
        'admin-uuid-1',
        'ethereum',
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-uuid-1',
          action: 'aml.blacklist.added',
          entityType: 'aml_blacklist',
          entityId: FAKE_BLACKLIST_ENTRY.id,
          newValue: {
            address: '0xBadActor1234567890abcdef1234567890abcdef',
            chain: 'ethereum',
            reason: 'Sanctioned address',
          },
        }),
      );
    });

    it('should allow adding without specifying a chain', async () => {
      const entryNoChain = { ...FAKE_BLACKLIST_ENTRY, chain: undefined };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([entryNoChain]),
        }),
      });

      const result = await service.add(
        '0xbadactor',
        'Generic bad actor',
        'admin-uuid-1',
      );

      expect(result.chain).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    it('should deactivate a blacklist entry', async () => {
      const deactivated = { ...FAKE_BLACKLIST_ENTRY, isActive: false };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deactivated]),
          }),
        }),
      });

      const result = await service.remove('bl-uuid-1', 'admin-uuid-1');

      expect(result.isActive).toBe(false);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should record an audit entry after removing', async () => {
      const deactivated = { ...FAKE_BLACKLIST_ENTRY, isActive: false };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deactivated]),
          }),
        }),
      });

      await service.remove('bl-uuid-1', 'admin-uuid-1');

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-uuid-1',
          action: 'aml.blacklist.removed',
          entityType: 'aml_blacklist',
          entityId: 'bl-uuid-1',
          newValue: { isActive: false },
        }),
      );
    });

    it('should return undefined when entry does not exist', async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([undefined]),
          }),
        }),
      });

      const result = await service.remove('nonexistent-id', 'admin-uuid-1');

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('should return active blacklist entries', async () => {
      const entries = [
        FAKE_BLACKLIST_ENTRY,
        {
          ...FAKE_BLACKLIST_ENTRY,
          id: 'bl-uuid-2',
          address: '0xanother',
        },
      ];
      mockDb.query.amlBlacklists.findMany.mockResolvedValue(entries);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result[0].isActive).toBe(true);
    });

    it('should return empty array when no entries exist', async () => {
      mockDb.query.amlBlacklists.findMany.mockResolvedValue([]);

      const result = await service.list();

      expect(result).toEqual([]);
    });

    it('should respect limit and offset parameters', async () => {
      mockDb.query.amlBlacklists.findMany.mockResolvedValue([
        FAKE_BLACKLIST_ENTRY,
      ]);

      await service.list(10, 5);

      expect(mockDb.query.amlBlacklists.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 5,
        }),
      );
    });

    it('should use default limit=100 and offset=0', async () => {
      mockDb.query.amlBlacklists.findMany.mockResolvedValue([]);

      await service.list();

      expect(mockDb.query.amlBlacklists.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          offset: 0,
        }),
      );
    });
  });
});
