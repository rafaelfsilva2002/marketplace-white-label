import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { WalletService } from './wallet.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

function chainedInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const FAKE_WALLET = {
  id: 'wallet-uuid-1',
  userId: 'user-uuid-1',
  balance: 1000,
  pendingBalance: 0,
  currency: 'BRL',
  version: 1,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const FAKE_LEDGER_ENTRY = {
  id: 'ledger-uuid-1',
  walletId: 'wallet-uuid-1',
  type: 'credit',
  amount: 500,
  balanceBefore: 1000,
  balanceAfter: 1500,
  description: 'Test credit',
  referenceType: null,
  referenceId: null,
  idempotencyKey: 'idem-key-1',
  correlationId: 'corr-1',
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletService', () => {
  let service: WalletService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockAuditService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new WalletService(
      mockDb as any,
      mockAuditService as any,
    );
  });

  // -----------------------------------------------------------------------
  // getOrCreateWallet
  // -----------------------------------------------------------------------

  describe('getOrCreateWallet', () => {
    it('should return existing wallet when one exists', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_WALLET]));

      const result = await service.getOrCreateWallet('user-uuid-1');

      expect(result.id).toBe(FAKE_WALLET.id);
      expect(result.balance).toBe(1000);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should create a new wallet when none exists', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      const newWallet = {
        id: 'new-wallet-id',
        userId: 'user-uuid-1',
        balance: 0,
        pendingBalance: 0,
        currency: 'BRL',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.insert.mockReturnValue(chainedInsert([newWallet]));

      const result = await service.getOrCreateWallet('user-uuid-1');

      expect(result.id).toBe('new-wallet-id');
      expect(result.balance).toBe(0);
      expect(result.currency).toBe('BRL');
    });
  });

  // -----------------------------------------------------------------------
  // credit
  // -----------------------------------------------------------------------

  describe('credit', () => {
    it('should credit the wallet and create a ledger entry', async () => {
      // No existing idempotency entry
      const idempSelectChain = chainedSelect([]);
      // getOrCreateWallet: wallet exists
      const walletSelectChain = chainedSelect([FAKE_WALLET]);

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return idempSelectChain;
        return walletSelectChain;
      });

      const updatedWallet = { ...FAKE_WALLET, balance: 1500, version: 2 };
      const newEntry = {
        ...FAKE_LEDGER_ENTRY,
        balanceAfter: 1500,
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(chainedSelect([FAKE_WALLET])),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedWallet]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue(chainedInsert([newEntry])),
        };
        return cb(tx);
      });

      const result = await service.credit(
        'user-uuid-1',
        500,
        'idem-key-1',
        'Test credit',
        undefined,
        undefined,
        'corr-credit-1',
      );

      expect(result.wallet.balance).toBe(1500);
      expect(result.ledgerEntry.amount).toBe(500);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'wallet.credit',
          entityType: 'wallet',
        }),
      );
    });

    it('should return existing entry on duplicate idempotency key (idempotent)', async () => {
      // Existing ledger entry found
      const existingEntry = { ...FAKE_LEDGER_ENTRY, walletId: FAKE_WALLET.id };
      const idempSelectChain = chainedSelect([existingEntry]);
      const walletSelectChain = chainedSelect([FAKE_WALLET]);

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return idempSelectChain;
        return walletSelectChain;
      });

      const result = await service.credit(
        'user-uuid-1',
        500,
        'idem-key-1',
      );

      // Should NOT have created a transaction
      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(result.wallet.id).toBe(FAKE_WALLET.id);
      expect(result.ledgerEntry.id).toBe(existingEntry.id);
    });

    it('should throw ConflictException on optimistic lock failure', async () => {
      mockDb.select.mockImplementation(() => {
        return chainedSelect([]);
      });

      // getOrCreateWallet: no existing => create
      mockDb.insert.mockReturnValue(chainedInsert([FAKE_WALLET]));

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(chainedSelect([FAKE_WALLET])),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                // No row returned means optimistic lock failed
                returning: vi.fn().mockResolvedValue([undefined]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue(chainedInsert([FAKE_LEDGER_ENTRY])),
        };
        return cb(tx);
      });

      await expect(
        service.credit('user-uuid-1', 500, 'idem-new', 'Test'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -----------------------------------------------------------------------
  // debit
  // -----------------------------------------------------------------------

  describe('debit', () => {
    it('should debit the wallet and create a ledger entry', async () => {
      // No existing idempotency entry
      const idempSelectChain = chainedSelect([]);
      // getOrCreateWallet: wallet exists
      const walletSelectChain = chainedSelect([FAKE_WALLET]);

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return idempSelectChain;
        return walletSelectChain;
      });

      const updatedWallet = { ...FAKE_WALLET, balance: 700, version: 2 };
      const debitEntry = {
        ...FAKE_LEDGER_ENTRY,
        type: 'debit',
        amount: 300,
        balanceBefore: 1000,
        balanceAfter: 700,
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(chainedSelect([FAKE_WALLET])),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedWallet]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue(chainedInsert([debitEntry])),
        };
        return cb(tx);
      });

      const result = await service.debit(
        'user-uuid-1',
        300,
        'idem-debit-1',
        'Test debit',
        undefined,
        undefined,
        'corr-debit-1',
      );

      expect(result.wallet.balance).toBe(700);
      expect(result.ledgerEntry.type).toBe('debit');
      expect(result.ledgerEntry.amount).toBe(300);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'wallet.debit',
          entityType: 'wallet',
        }),
      );
    });

    it('should return existing entry on duplicate idempotency key (idempotent)', async () => {
      const existingEntry = {
        ...FAKE_LEDGER_ENTRY,
        type: 'debit',
        walletId: FAKE_WALLET.id,
      };

      const idempSelectChain = chainedSelect([existingEntry]);
      const walletSelectChain = chainedSelect([FAKE_WALLET]);

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return idempSelectChain;
        return walletSelectChain;
      });

      const result = await service.debit(
        'user-uuid-1',
        300,
        'idem-debit-1',
      );

      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(result.wallet.id).toBe(FAKE_WALLET.id);
      expect(result.ledgerEntry.type).toBe('debit');
    });

    it('should throw ConflictException when balance is insufficient', async () => {
      // No idempotency hit
      mockDb.select.mockImplementation(() => {
        return chainedSelect([]);
      });

      // getOrCreateWallet creates wallet with low balance
      const lowBalanceWallet = { ...FAKE_WALLET, balance: 50 };
      mockDb.insert.mockReturnValue(chainedInsert([lowBalanceWallet]));

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(chainedSelect([lowBalanceWallet])),
        };
        return cb(tx);
      });

      await expect(
        service.debit('user-uuid-1', 500, 'idem-insuf', 'Too much'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.debit('user-uuid-1', 500, 'idem-insuf', 'Too much'),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  // -----------------------------------------------------------------------
  // getBalance
  // -----------------------------------------------------------------------

  describe('getBalance', () => {
    it('should return the wallet balance info', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_WALLET]));

      const result = await service.getBalance('user-uuid-1');

      expect(result.balance).toBe(1000);
      expect(result.pendingBalance).toBe(0);
      expect(result.currency).toBe('BRL');
    });
  });

  // -----------------------------------------------------------------------
  // getHistory
  // -----------------------------------------------------------------------

  describe('getHistory', () => {
    it('should return ledger entries and total count', async () => {
      // First call: getOrCreateWallet
      const walletSelect = chainedSelect([FAKE_WALLET]);

      // Second call: entries query
      const entriesSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([FAKE_LEDGER_ENTRY]),
              }),
            }),
          }),
        }),
      };

      // Third call: count query
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletSelect;
        if (callCount === 2) return entriesSelect;
        return countSelect;
      });

      const result = await service.getHistory('user-uuid-1', 50, 0);

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.entries[0].id).toBe(FAKE_LEDGER_ENTRY.id);
    });
  });
});
