-- make sure the pgvector extension is present
-- CREATE EXTENSION IF NOT EXISTS pgvector;

CREATE OR REPLACE FUNCTION match_documents_test_only_matches (
    query_embedding  vector(1536),     -- the search vector
    p_dt             DATE,             -- ⟵ NEW: the date you care about
    match_threshold  FLOAT,            -- minimum similarity you’ll allow
    match_count      INT               -- how many rows to return
)
RETURNS TABLE (
    id          BIGINT,
    content     TEXT,
    similarity  FLOAT,
    name_in_db  VARCHAR
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        content,
        1 - (embedding <=> query_embedding)          AS similarity,
        name_in_db
    FROM  documents_for_work_world_for_lawyers
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    -- 1st key: rows whose dt equals p_dt come first;
    -- 2nd key: among those, pick the ones with the smallest distance
    order by CASE WHEN dt::date = p_dt::date THEN 0 ELSE 1 END,
    (embedding <=> query_embedding) ASC
    LIMIT match_count;
$$;
