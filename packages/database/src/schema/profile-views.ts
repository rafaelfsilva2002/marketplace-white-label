import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profiles } from './profiles';

export const profileViews = pgTable(
  'profile_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sessionId: text('session_id'),
    duration: integer('duration'),
    source: text('source'),
    referrer: text('referrer'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('profile_views_profile_id_idx').on(table.profileId),
    index('profile_views_viewer_id_idx').on(table.viewerId),
    index('profile_views_session_id_idx').on(table.sessionId),
    index('profile_views_source_idx').on(table.source),
    index('profile_views_created_at_idx').on(table.createdAt),
    index('profile_views_profile_id_created_at_idx').on(
      table.profileId,
      table.createdAt,
    ),
  ],
);

export const profileViewsRelations = relations(profileViews, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileViews.profileId],
    references: [profiles.id],
  }),
  viewer: one(users, {
    fields: [profileViews.viewerId],
    references: [users.id],
  }),
}));

export type ProfileView = typeof profileViews.$inferSelect;
export type NewProfileView = typeof profileViews.$inferInsert;
