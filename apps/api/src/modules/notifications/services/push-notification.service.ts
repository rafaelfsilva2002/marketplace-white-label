import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN } from '@/config/database.config';
import type { Database } from '@marketplace/database';
import { pushTokens } from '@marketplace/database';
import { eq, and, inArray } from 'drizzle-orm';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
  ): Promise<void> {
    await this.db
      .insert(pushTokens)
      .values({ userId, token, platform, isActive: true })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: {
          userId,
          platform,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    this.logger.log(`Push token registered for user ${userId} (${platform})`);
  }

  async removeToken(token: string): Promise<void> {
    await this.db
      .update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushTokens.token, token));

    this.logger.log(`Push token deactivated: ${token.slice(0, 20)}...`);
  }

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const tokens = await this.db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(
        and(
          eq(pushTokens.userId, userId),
          eq(pushTokens.isActive, true),
        ),
      );

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for user ${userId}`);
      return;
    }

    const messages: ExpoPushMessage[] = tokens.map(({ token }) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
      priority: 'high' as const,
    }));

    await this.sendToExpo(messages);
  }

  async sendBulkPush(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (userIds.length === 0) return;

    const tokens = await this.db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(
        and(
          inArray(pushTokens.userId, userIds),
          eq(pushTokens.isActive, true),
        ),
      );

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for ${userIds.length} users`);
      return;
    }

    const messages: ExpoPushMessage[] = tokens.map(({ token }) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
      priority: 'high' as const,
    }));

    await this.sendToExpo(messages);
  }

  private async sendToExpo(messages: ExpoPushMessage[]): Promise<void> {
    // Expo Push API accepts batches of up to 100 messages
    const BATCH_SIZE = 100;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          this.logger.error(
            `Expo Push API returned ${response.status}: ${await response.text()}`,
          );
          continue;
        }

        const result = await response.json() as { data: ExpoPushTicket[] };

        // Handle individual ticket errors (e.g. invalid tokens)
        for (let j = 0; j < result.data.length; j++) {
          const ticket = result.data[j];
          if (ticket.status === 'error') {
            this.logger.warn(
              `Push failed for token ${batch[j].to.slice(0, 20)}...: ${ticket.message}`,
            );

            // Deactivate tokens that are no longer valid
            if (
              ticket.details &&
              (ticket.details as Record<string, string>).error === 'DeviceNotRegistered'
            ) {
              await this.removeToken(batch[j].to);
            }
          }
        }

        this.logger.log(
          `Sent ${batch.length} push notifications via Expo (batch ${Math.floor(i / BATCH_SIZE) + 1})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send push notifications to Expo`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
