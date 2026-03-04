import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { amlBlacklists } from '@marketplace/database';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class BlacklistService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async add(
    address: string,
    reason: string,
    addedBy: string,
    chain?: string,
  ) {
    const [entry] = await this.db
      .insert(amlBlacklists)
      .values({ address: address.toLowerCase(), chain, reason, addedBy })
      .returning();

    await this.audit.record({
      userId: addedBy,
      action: 'aml.blacklist.added',
      entityType: 'aml_blacklist',
      entityId: entry.id,
      newValue: { address, chain, reason },
    });

    return entry;
  }

  async remove(id: string, removedBy: string) {
    const [updated] = await this.db
      .update(amlBlacklists)
      .set({ isActive: false })
      .where(eq(amlBlacklists.id, id))
      .returning();

    await this.audit.record({
      userId: removedBy,
      action: 'aml.blacklist.removed',
      entityType: 'aml_blacklist',
      entityId: id,
      newValue: { isActive: false },
    });

    return updated;
  }

  async list(limit = 100, offset = 0) {
    return this.db.query.amlBlacklists.findMany({
      where: eq(amlBlacklists.isActive, true),
      orderBy: (b, { desc }) => [desc(b.createdAt)],
      limit,
      offset,
    });
  }
}
