-- Search + recommendation performance indexes (Phase 2)
-- Generated: 2026-03-06

-- 1) Full-text search acceleration for SearchService.fullTextSearch/autocomplete
CREATE INDEX IF NOT EXISTS idx_profiles_fts_portuguese_active
ON profiles
USING gin (
  to_tsvector(
    'portuguese',
    coalesce(display_name, '') || ' ' ||
    coalesce(bio, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(city, '') || ' ' ||
    coalesce(state, '') || ' ' ||
    array_to_string(services, ' ')
  )
)
WHERE is_active = true;

-- 2) Vector similarity acceleration for semantic search/recommendations
CREATE INDEX IF NOT EXISTS idx_profiles_embedding_hnsw_active
ON profiles
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL AND is_active = true;

-- 3) Geo search acceleration for ST_DWithin/ST_Distance over profile location
CREATE INDEX IF NOT EXISTS idx_profiles_location_gist_active
ON profiles
USING gist ((location::geography))
WHERE location IS NOT NULL AND is_active = true;
