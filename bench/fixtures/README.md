# bench/fixtures/

Fixtures used by the bench dimensions. All files here are committed
to the repo so every developer runs against the same inputs.

## `labeled_retrieval.jsonl`

Hand-labeled retrieval scenarios used by `bench/dimensions/retrieval_quality.py`
to compute recall@k, NDCG@k, and per-pathway contribution.

One JSON object per line. Schema:

```json
{
  "query_text":          "<the signal text or trigger context>",
  "tenant_id":           "<uuid>",
  "relevant_model_ids":  ["<uuid>", "<uuid>", ...]
}
```

Lines beginning with `#` and blank lines are skipped.

The file starts small but every entry is high-leverage — the
retrieval-quality dim is only as good as the labels behind it. To add
labels:

1. Pick a real trigger (or build a representative synthetic one).
2. Manually rank the top-20 Models the retriever should surface for
   that context.
3. Add a row to this file.

The schema is intentionally light. Future enhancements can attach
per-label difficulty, expected pathway distribution, etc.

## `db_snapshot.sql` (planned)

A committed `pg_dump` of a seeded state — tenants, actors, ~500
observations, ~100 Models — so every bench run starts from an
identical DB. Restored by `bench/runner.py` before each measurement
round.

Not yet created; tracked as a follow-up. For the initial release the
bench runs against whatever state is in the local Postgres, which is
sufficient for relative-to-baseline regression detection on the same
developer machine.
