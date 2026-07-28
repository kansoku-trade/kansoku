# Migrations

Hand-written SQL plus an entry in `meta/_journal.json`. Snapshots under `meta/`
stop at `0003`; nothing regenerates them, so do not expect `drizzle-kit` to be
the source of truth here.

## Choosing `when`

**Use a real current epoch-milliseconds value, not "previous + 1000".**

Drizzle applies an entry only when its `when` is greater than the `created_at` of
the last row in the database's `__drizzle_migrations`. That column records the
`when` of the entry _as it was at the time it ran_ — so if a journal entry is ever
renumbered after someone has already migrated, their database keeps the original,
larger value, and every later entry numbered below it is **silently skipped**. No
error, no warning: the table simply never appears, and the failure surfaces much
later as `no such table`.

That has already happened here. On a database migrated before the renumbering,
`0009` and `0010` are recorded at `1784793600000` / `1784794600000`, while the
journal now lists them at `1784038000000` / `1784039000000`. Any entry numbered
below `1784794600000` will never run on such a database.

A real timestamp is monotonic against wall clock, so it clears whatever any
database already holds:

```bash
node -e 'console.log(Date.now())'
```

## Verifying a migration actually ran

The ledger is the only honest answer — the app starting up is not one, because a
skipped migration raises nothing at boot:

```bash
sqlite3 journal/charts/data/app.db \
  "select count(*) from __drizzle_migrations;" # compare against the journal length
sqlite3 journal/charts/data/app.db \
  "select name from sqlite_master where type='table';" # the new table should be listed
```
