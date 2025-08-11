-- make sure the pgvector extension is present
-- CREATE EXTENSION IF NOT EXISTS pgvector;

CREATE OR REPLACE FUNCTION match_documents_test (
    query_embedding  vector(1536),     -- the search vector
    p_dt             DATE,             -- ⟵ NEW: the date you care about
    match_threshold  FLOAT,            -- minimum similarity you'll allow
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
    WITH qualifying_matches AS (
        SELECT DISTINCT name_in_db
        FROM documents_for_work_world_for_lawyers
        WHERE 1 - (embedding <=> query_embedding) > match_threshold
        ORDER BY CASE WHEN dt::date = p_dt::date THEN 0 ELSE 1 END,
                 (embedding <=> query_embedding) ASC
        LIMIT match_count
    )
    SELECT
        d.id,
        d.content,
        1 - (d.embedding <=> query_embedding) AS similarity,
        d.name_in_db
    FROM documents_for_work_world_for_lawyers d
    INNER JOIN qualifying_matches qm ON d.name_in_db = qm.name_in_db
    ORDER BY CASE WHEN d.dt::date = p_dt::date THEN 0 ELSE 1 END,
             (d.embedding <=> query_embedding) ASC,
             d.name_in_db ASC,
             d.id ASC;
$$;