# Supabase tracking setup

This app expects a public tracking id (Base62) stored in the `Receipt` table as `public_id`.
The UI builds `/tracking/<public_id>` links from that column, while internal operations
still use the UUID (`id_order`).

## 1) Add `public_id` column and index

Run this in Supabase SQL Editor:

```sql
ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS public_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_public_id
  ON "Receipt" (public_id)
  WHERE public_id IS NOT NULL;
```

## 2) Ensure Data API exposure (if needed)

Supabase recently changed defaults: new tables/columns may not be exposed to the Data API
for `anon`/`authenticated` roles. If you see errors like "relation not exposed", make sure:

- The `Receipt` table is exposed to the Data API.
- The `anon` role has SELECT permission on `Receipt`.

Reference: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## 3) RLS policies

If RLS is enabled, the tracking page needs SELECT access. The migration file in this repo
already includes:

```sql
CREATE POLICY IF NOT EXISTS "receipt_public_select"
  ON "Receipt" FOR SELECT USING (true);
```

If you removed that policy, re-add it (or adjust to your rules).

## 4) Optional backfill for existing orders

If you already have orders with UUID-based links and want Base62 links to work, you need
to backfill `public_id`. You can do this in your app or via a one-off script.

Example approach (pseudo):
- Load all `Receipt` rows where `public_id` is null.
- Generate a Base62 id per row (length 12).
- Update the row with that id.

Make sure `public_id` is unique before writing.

## 5) Verify

- Create a new order in the UI.
- Confirm the modal shows a Base62 id and the link opens `/tracking/<public_id>`.
- Copy the tracking link from the dashboard and verify it opens.
- Confirm invalid links like `/tracking/@@@` redirect to `/not-found`.
