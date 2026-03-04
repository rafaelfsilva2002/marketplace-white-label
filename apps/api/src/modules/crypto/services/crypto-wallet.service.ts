import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { cryptoWallets } from '@marketplace/database';
import { CRYPTO_GATEWAY, type CryptoGateway, type Chain } from '@marketplace/crypto-gateway';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class CryptoWalletService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(CRYPTO_GATEWAY) private readonly gateway: CryptoGateway,
    private readonly audit: AuditService,
  ) {}

  async createWallet(userId: string, chain: Chain) {
    const existing = await this.db.query.cryptoWallets.findFirst({
      where: and(
        eq(cryptoWallets.userId, userId),
        eq(cryptoWallets.chain, chain),
      ),
    });

    if (existing) {
      throw new ConflictException('Wallet already exists for this chain');
    }

    const result = await this.gateway.createWallet({ userId, chain });

    const [wallet] = await this.db
      .insert(cryptoWallets)
      .values({
        userId,
        chain,
        address: result.address,
        dfnsWalletId: result.walletId,
      })
      .returning();

    await this.audit.record({
      userId,
      action: 'crypto.wallet.created',
      entityType: 'crypto_wallet',
      entityId: wallet.id,
      newValue: { chain, address: result.address },
    });

    return wallet;
  }

  async listWallets(userId: string) {
    return this.db.query.cryptoWallets.findMany({
      where: eq(cryptoWallets.userId, userId),
    });
  }

  async getWallet(userId: string, chain: Chain) {
    return this.db.query.cryptoWallets.findFirst({
      where: and(
        eq(cryptoWallets.userId, userId),
        eq(cryptoWallets.chain, chain),
      ),
    });
  }
}
