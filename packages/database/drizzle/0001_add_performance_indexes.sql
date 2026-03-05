-- Performance-critical indexes migration
-- Only includes indexes NOT already defined in Drizzle schema,
-- or partial/DESC variants that improve on existing non-partial indexes.
--
-- Generated: 2026-03-04

-- ============================================================
-- Users indexes
-- ============================================================
-- email already has a UNIQUE constraint (acts as unique index) — skip
-- role and created_at have no indexes in the schema
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- ============================================================
-- Profiles indexes (partial indexes for active-only queries)
-- ============================================================
-- user_id already has UNIQUE + index — skip
-- The Drizzle schema defines non-partial indexes on is_active, (city, state),
-- and search_score. These partial indexes are additive and more selective
-- for the hot path (active profiles only).
CREATE INDEX IF NOT EXISTS idx_profiles_is_active_partial ON profiles (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_city_state_active ON profiles (city, state) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_views_count_desc ON profiles (views_count DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_search_score_desc ON profiles (search_score DESC) WHERE is_active = true;

-- ============================================================
-- Reviews indexes
-- ============================================================
-- profile_id and reviewer_id already indexed — skip
-- created_at exists but without DESC; add DESC variant for recent-first queries
CREATE INDEX IF NOT EXISTS idx_reviews_created_at_desc ON reviews (created_at DESC);

-- ============================================================
-- Payments indexes (wallets + ledger_entries)
-- ============================================================
-- wallets.user_id and ledger_entries.wallet_id already indexed — skip
-- ledger_entries.created_at exists but without DESC
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at_desc ON ledger_entries (created_at DESC);

-- ============================================================
-- Subscriptions indexes
-- ============================================================
-- Note: subscriptions table has user_id, not profile_id — skip profile_id index
-- status already indexed but non-partial; add partial for active-only lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_active ON subscriptions (status) WHERE status = 'active';

-- ============================================================
-- AI indexes (moderation_queue, fraud_scores, embedding_cache)
-- ============================================================
-- moderation_queue.status already indexed but non-partial; add partial for pending
CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_pending ON moderation_queue (status) WHERE status = 'pending';

-- fraud_scores.score already indexed but without DESC; add DESC variant
-- Note: column is "score" not "risk_score"
CREATE INDEX IF NOT EXISTS idx_fraud_scores_score_desc ON fraud_scores (score DESC);

-- embedding_cache.content_hash already indexed — skip
-- Note: column is "content_hash" not "input_hash"

-- ============================================================
-- Audit log indexes
-- ============================================================
-- (entity_type, entity_id) and user_id already indexed — skip
-- created_at exists but without DESC
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON audit_logs (created_at DESC);

-- ============================================================
-- Profile views indexes
-- ============================================================
-- profile_id and viewer_id already indexed — skip

-- ============================================================
-- Outbox indexes
-- ============================================================
-- Note: table is "outbox_events" not "outbox"
-- status already indexed but non-partial; add partial for pending
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_pending ON outbox_events (status) WHERE status = 'pending';
