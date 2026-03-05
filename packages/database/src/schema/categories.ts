import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { profiles } from './profiles';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }),
    parentId: uuid('parent_id').references((): any => categories.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('categories_slug_idx').on(table.slug),
    index('categories_parent_id_idx').on(table.parentId),
    index('categories_is_active_idx').on(table.isActive),
    index('categories_sort_order_idx').on(table.sortOrder),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'parentChild',
  }),
  children: many(categories, {
    relationName: 'parentChild',
  }),
  profileCategories: many(profileCategories),
}));

export const profileCategories = pgTable(
  'profile_categories',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.categoryId] }),
    index('profile_categories_profile_id_idx').on(table.profileId),
    index('profile_categories_category_id_idx').on(table.categoryId),
  ],
);

export const profileCategoriesRelations = relations(
  profileCategories,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [profileCategories.profileId],
      references: [profiles.id],
    }),
    category: one(categories, {
      fields: [profileCategories.categoryId],
      references: [categories.id],
    }),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type ProfileCategory = typeof profileCategories.$inferSelect;
export type NewProfileCategory = typeof profileCategories.$inferInsert;
