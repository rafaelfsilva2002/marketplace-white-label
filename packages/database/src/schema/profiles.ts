import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  real,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profileCategories } from './categories';

const vector = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    const str = String(value);
    return str
      .replace('[', '')
      .replace(']', '')
      .split(',')
      .map(Number);
  },
});

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    description: text('description'),

    // PostGIS geography column stored as text; actual geography type managed at DB level
    location: text('location'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    address: text('address'),

    services: text('services').array().notNull().default([]),
    priceRange: jsonb('price_range').$type<{ min: number; max: number }>(),
    photos: text('photos').array().notNull().default([]),

    embedding: vector('embedding', { dimensions: 1536 }),

    isVerified: boolean('is_verified').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),

    viewsCount: integer('views_count').notNull().default(0),
    searchScore: real('search_score').notNull().default(0),

    verifiedBy: uuid('verified_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_user_id_idx').on(table.userId),
    index('profiles_city_state_idx').on(table.city, table.state),
    index('profiles_is_active_idx').on(table.isActive),
    index('profiles_search_score_idx').on(table.searchScore),
    index('profiles_created_at_idx').on(table.createdAt),
  ],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  verifier: one(users, {
    fields: [profiles.verifiedBy],
    references: [users.id],
    relationName: 'verifiedByUser',
  }),
  profileCategories: many(profileCategories),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
