# Journal & Notes Discipline

> Chapter of `trading-discipline`. Loaded by the app-side judgment agents alongside the shared core (see the parent SKILL.md). Not loaded by the bench episode runner — bench does not write journal entries or per-symbol notes.

---

## E. Journal and Notes Conventions (applies to any agent that reads the account or writes journal / stocks notes)

**TD-JOURNAL-01 — Journal file names use the US trading day; same-day re-runs append a section, never overwrite.** The date in the filename is the US trading day, not the Asian local calendar day.

**TD-NOTES-01 — `stocks/{SYMBOL}.md` grows incrementally; do not rewrite the whole file.** Add new events to the relevant section; delete only paragraphs that are clearly stale. Tickers and CLI / API names stay in English.
