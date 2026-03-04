import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { CryptoWalletService } from './crypto-wallet.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_WALLET = {
  id: 'cw-uuid-1',
  userId: 'user-uuid-1',
  chain: 'polygon' as const,
  address: '0xABCDEF1234567890abcdef1234567890abcdef12',
  dfnsWalletId: 'dfns-wallet-id-1',
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CryptoWalletService', () => {
  let service: CryptoWalletService;
  let mockDb: Record<string, any>;
  let mockGateway: Record<string, ReturnType<typeof vi.fn>>;
  let mockAudit: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      query: {
        cryptoWallets: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(),
    };

    mockGateway = {
      createWallet: vi.fn(),
    };

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new CryptoWalletService(
      mockDb as any,
      mockGateway as any,
      mockAudit as any,
    );
  });

  // -------------------------------------------------------------------------
  // createWallet
  // -------------------------------------------------------------------------

  describe('createWallet', () => {
    it('should create a wallet and persist it', async () => {
      mockDb.query.cryptoWallets.findFirst.mockResolvedValue(undefined);

      mockGateway.createWallet.mockResolvedValue({
        walletId: 'dfns-wallet-id-1',
        address: '0xABCDEF1234567890abcdef1234567890abcdef12',
        chain: 'polygon',
      });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([FAKE_WALLET]),
        }),
      });

      const result = await service.createWallet('user-uuid-1', 'polygon');

      expect(result).toEqual(FAKE_WALLET);
      expect(mockGateway.createWallet).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        chain: 'polygon',
      });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'crypto.wallet.created',
          entityType: 'crypto_wallet',
          entityId: FAKE_WALLET.id,
          newValue: {
            chain: 'polygon',
            address: '0xABCDEF1234567890abcdef1234567890abcdef12',
          },
        }),
      );
    });

    it('should throw ConflictException when wallet already exists for chain', async () => {
      mockDb.query.cryptoWallets.findFirst.mockResolvedValue(FAKE_WALLET);

      await expect(
        service.createWallet('user-uuid-1', 'polygon'),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createWallet('user-uuid-1', 'polygon'),
      ).rejects.toThrow('Wallet already exists for this chain');

      expect(mockGateway.createWallet).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should call the crypto gateway with correct chain', async () => {
      mockDb.query.cryptoWallets.findFirst.mockResolvedValue(undefined);

      mockGateway.createWallet.mockResolvedValue({
        walletId: 'dfns-eth-wallet',
        address: '0x1111111111111111111111111111111111111111',
        chain: 'ethereum',
      });

      const ethWallet = {
        ...FAKE_WALLET,
        chain: 'ethereum' as const,
        address: '0x1111111111111111111111111111111111111111',
        dfnsWalletId: 'dfns-eth-wallet',
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([ethWallet]),
        }),
      });

      const result = await service.createWallet('user-uuid-1', 'ethereum');

      expect(result.chain).toBe('ethereum');
      expect(mockGateway.createWallet).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        chain: 'ethereum',
      });
    });
  });

  // -------------------------------------------------------------------------
  // listWallets
  // -------------------------------------------------------------------------

  describe('listWallets', () => {
    it('should return all wallets for a user', async () => {
      const wallets = [
        FAKE_WALLET,
        {
          ...FAKE_WALLET,
          id: 'cw-uuid-2',
          chain: 'ethereum' as const,
          address: '0x2222222222222222222222222222222222222222',
        },
      ];
      mockDb.query.cryptoWallets.findMany.mockResolvedValue(wallets);

      const result = await service.listWallets('user-uuid-1');

      expect(result).toHaveLength(2);
      expect(result[0].chain).toBe('polygon');
      expect(result[1].chain).toBe('ethereum');
    });

    it('should return empty array when user has no wallets', async () => {
      mockDb.query.cryptoWallets.findMany.mockResolvedValue([]);

      const result = await service.listWallets('user-no-wallets');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getWallet
  // -------------------------------------------------------------------------

  describe('getWallet', () => {
    it('should return the wallet for a specific user and chain', async () => {
      mockDb.query.cryptoWallets.findFirst.mockResolvedValue(FAKE_WALLET);

      const result = await service.getWallet('user-uuid-1', 'polygon');

      expect(result).toEqual(FAKE_WALLET);
      expect(result!.chain).toBe('polygon');
      expect(result!.userId).toBe('user-uuid-1');
    });

    it('should return undefined when wallet does not exist', async () => {
      mockDb.query.cryptoWallets.findFirst.mockResolvedValue(undefined);

      const result = await service.getWallet('user-uuid-1', 'solana');

      expect(result).toBeUndefined();
    });
  });
});
