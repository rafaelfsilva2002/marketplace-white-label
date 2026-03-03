import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profiles } from './profiles';

export const sentimentEnum = pgEnum('sentiment', [
  'positive',
  'neutral',
  'negative',
]);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    sentiment: sentimentEnum('sentiment'),
    sentimentScore: real('sentiment_score'),
    isVisible: text('is_visible').notNull().default('true'),
    moderatedBy: uuid('moderated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    moderatedAt: timestamp('moderated_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('reviews_profile_id_idx').on(table.profileId),
    index('reviews_reviewer_id_idx').on(table.reviewerId),
    index('reviews_rating_idx').on(table.rating),
    index('reviews_sentiment_idx').on(table.sentiment),
    index('reviews_created_at_idx').on(table.createdAt),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  profile: one(profiles, {
    fields: [reviews.profileId],
    references: [profiles.id],
  }),
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
    relationName: 'reviewsByUser',
  }),
  moderator: one(users, {
    fields: [reviews.moderatedBy],
    references: [users.id],
    relationName: 'reviewsModeratedByUser',
  }),
}));

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
