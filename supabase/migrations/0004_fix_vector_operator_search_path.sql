-- ===================================================================
--  GuardAI — pgvector operator resolution fix
--
--  Bug: `match_log_chunks` was created with `set search_path = ''`.
--  Table references inside it are schema-qualified, but an *operator*
--  cannot be qualified with dot notation — `<=>` is resolved through the
--  search path like any other operator. With an empty search path only
--  `pg_catalog` is visible, so the cosine-distance operator supplied by
--  the `vector` extension is invisible at runtime.
--
--  Symptom, only once a file actually reaches the RAG sweep:
--    operator does not exist: public.vector <=> public.vector
--
--  Fix: give the function a search path that includes the schema holding
--  the extension. Supabase installs `vector` into `extensions` on newer
--  projects and `public` on others, so both are listed — a schema that
--  does not exist is simply skipped. This is safe here because the
--  function is SECURITY INVOKER: it runs with the caller's privileges, so
--  a permissive search path grants nothing (the hardened empty path
--  matters for SECURITY DEFINER functions, which this is not).
--
--  Table references stay fully qualified regardless.
--  Idempotent: safe to re-run.
-- ===================================================================

create or replace function public.match_log_chunks(
  query_embedding vector(1536),
  filter_workspace uuid,
  match_count int default 8,
  similarity_threshold float default 0.0,
  filter_file uuid default null
)
returns table (
  id uuid,
  file_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  -- pgvector >= 0.8 keeps HNSW recall correct when a WHERE clause filters
  -- most rows out. Older builds simply do not expose the GUC.
  begin
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  exception when others then
    null;
  end;

  return query
  select
    c.id,
    c.file_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.log_chunks c
  where c.workspace_id = filter_workspace
    and c.embedding is not null
    and (filter_file is null or c.file_id = filter_file)
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
end;
$$;

grant execute on function
  public.match_log_chunks(vector, uuid, int, float, uuid) to authenticated;

-- -------------------------------------------------------------------
--  Smoke test
--
--  Proves the operator resolves without needing a file to be ingested
--  first. Returns true when the vector maths runs.
-- -------------------------------------------------------------------

create or replace function public.debug_vector_ops()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  distance float;
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  select '[1,0,0]'::vector <=> '[0,1,0]'::vector into distance;

  return jsonb_build_object(
    'ok', true,
    'vector_extension_schema', ext_schema,
    'sample_cosine_distance', distance
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.debug_vector_ops() to authenticated;
