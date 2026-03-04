import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { CryptoBalanceService } from './crypto-balance.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_BALANCE = {
  id: 'bal-uuid-1',
  userId: 'user-uuid-1',
  token: 'USDC' as const,
  chain: 'polygon' as const,
  balance: '1000000',
  version: 1,
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
};

const FAKE_LEDGER_ENTRY = {
  id: 'ledger-uuid-1',
  userId: 'user-uuid-1',
  token: 'USDC',
  chain: 'polygon',
  type: 'credit',
  amount: '500000',
  balanceBefore: '1000000',
  balanceAfter: '1500000',
  referenceType: null,
  referenceId: null,
  idempotencyKey: 'idem-credit-1',
  correlationId: 'corr-1',
  createdAt: new Date(),
};

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-uuid-1',
    token: 'USDC' as const,
    chain: 'polygon' as const,
    amount: '500000',
    idempotencyKey: 'idem-credit-1',
    referenceType: undefined,
    referenceId: undefined,
    correlationId: 'corr-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CryptoBalanceService', () => {
  let service: CryptoBalanceService;
  let mockDb: Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      query: {
        cryptoLedger: {
          findFirst: vi.fn(),
        },
        cryptoBalances: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      transaction: vi.fn(),
    };

    service = new CryptoBalanceService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // credit
  // -------------------------------------------------------------------------

  describe('credit', () => {
    it('should credit balance and return ledger entry', async () => {
      // No existing idempotency entry
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      const updatedBalance = {
        ...FAKE_BALANCE,
        balance: '1500000',
        version: 2,
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(FAKE_BALANCE),
            },
          },
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedBalance]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([FAKE_LEDGER_ENTRY]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.credit(makeInput());

      expect(result).toEqual(FAKE_LEDGER_ENTRY);
      expect(result.type).toBe('credit');
      expect(result.amount).toBe('500000');
      expect(result.balanceAfter).toBe('1500000');
    });

    it('should return existing entry on duplicate idempotency key (idempotent)', async () => {
      const existingEntry = { ...FAKE_LEDGER_ENTRY };
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(existingEntry);

      const result = await service.credit(makeInput());

      expect(result).toEqual(existingEntry);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should create balance record if none exists', async () => {
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      const newBalance = {
        ...FAKE_BALANCE,
        balance: '0',
        version: 1,
      };
      const updatedBalance = {
        ...newBalance,
        balance: '500000',
        version: 2,
      };

      const creditEntry = {
        ...FAKE_LEDGER_ENTRY,
        balanceBefore: '0',
        balanceAfter: '500000',
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(undefined),
            },
          },
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValueOnce([newBalance])
                .mockResolvedValueOnce([creditEntry]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedBalance]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.credit(
        makeInput({ idempotencyKey: 'idem-new-user' }),
      );

      expect(result.balanceBefore).toBe('0');
      expect(result.balanceAfter).toBe('500000');
    });

    it('should throw ConflictException on optimistic locking conflict', async () => {
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(FAKE_BALANCE),
            },
          },
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                // Empty array = version mismatch, optimistic lock failed
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([FAKE_LEDGER_ENTRY]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(
        service.credit(makeInput({ idempotencyKey: 'idem-conflict' })),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.credit(makeInput({ idempotencyKey: 'idem-conflict' })),
      ).rejects.toThrow('Balance modified concurrently, retry');
    });
  });

  // -------------------------------------------------------------------------
  // debit
  // -------------------------------------------------------------------------

  describe('debit', () => {
    it('should debit balance with sufficient funds', async () => {
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      const updatedBalance = {
        ...FAKE_BALANCE,
        balance: '500000',
        version: 2,
      };

      const debitEntry = {
        ...FAKE_LEDGER_ENTRY,
        type: 'debit',
        balanceBefore: '1000000',
        balanceAfter: '500000',
        idempotencyKey: 'idem-debit-1',
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(FAKE_BALANCE),
            },
          },
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedBalance]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([debitEntry]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.debit(
        makeInput({ idempotencyKey: 'idem-debit-1' }),
      );

      expect(result.type).toBe('debit');
      expect(result.balanceAfter).toBe('500000');
    });

    it('should return existing entry on duplicate idempotency key (idempotent)', async () => {
      const existingDebit = {
        ...FAKE_LEDGER_ENTRY,
        type: 'debit',
        idempotencyKey: 'idem-debit-dup',
      };
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(existingDebit);

      const result = await service.debit(
        makeInput({ idempotencyKey: 'idem-debit-dup' }),
      );

      expect(result).toEqual(existingDebit);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when balance is insufficient', async () => {
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      const lowBalance = { ...FAKE_BALANCE, balance: '100' };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(lowBalance),
            },
          },
        };
        return cb(tx);
      });

      await expect(
        service.debit(
          makeInput({ amount: '500000', idempotencyKey: 'idem-insuf' }),
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.debit(
          makeInput({ amount: '500000', idempotencyKey: 'idem-insuf' }),
        ),
      ).rejects.toThrow('Insufficient crypto balance');
    });

    it('should throw ConflictException on optimistic locking conflict', async () => {
      mockDb.query.cryptoLedger.findFirst.mockResolvedValue(undefined);

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          query: {
            cryptoBalances: {
              findFirst: vi.fn().mockResolvedValue(FAKE_BALANCE),
            },
          },
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([FAKE_LEDGER_ENTRY]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(
        service.debit(
          makeInput({ amount: '100', idempotencyKey: 'idem-lock-debit' }),
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.debit(
          makeInput({ amount: '100', idempotencyKey: 'idem-lock-debit' }),
        ),
      ).rejects.toThrow('Balance modified concurrently, retry');
    });
  });

  // -------------------------------------------------------------------------
  // getBalances
  // -------------------------------------------------------------------------

  describe('getBalances', () => {
    it('should return all balances for user', async () => {
      const balances = [
        FAKE_BALANCE,
        { ...FAKE_BALANCE, id: 'bal-uuid-2', token: 'ETH', chain: 'ethereum' },
      ];
      mockDb.query.cryptoBalances.findMany.mockResolvedValue(balances);

      const result = await service.getBalances('user-uuid-1');

      expect(result).toHaveLength(2);
      expect(result[0].token).toBe('USDC');
      expect(result[1].token).toBe('ETH');
    });

    it('should return empty array when user has no balances', async () => {
      mockDb.query.cryptoBalances.findMany.mockResolvedValue([]);

      const result = await service.getBalances('user-no-balances');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getBalance
  // -------------------------------------------------------------------------

  describe('getBalance', () => {
    it('should return balance for specific token and chain', async () => {
      mockDb.query.cryptoBalances.findFirst.mockResolvedValue(FAKE_BALANCE);

      const result = await service.getBalance('user-uuid-1', 'USDC', 'polygon');

      expect(result).toEqual(FAKE_BALANCE);
      expect(result!.token).toBe('USDC');
      expect(result!.chain).toBe('polygon');
    });

    it('should return undefined when balance does not exist', async () => {
      mockDb.query.cryptoBalances.findFirst.mockResolvedValue(undefined);

      const result = await service.getBalance('user-uuid-1', 'SOL', 'solana');

      expect(result).toBeUndefined();
    });
  });
});
