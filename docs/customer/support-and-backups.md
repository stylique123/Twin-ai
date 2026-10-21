# Support and backups (DRAFT for counsel review)

> **DRAFT for counsel review. Not legal advice.** Plain steps for the owner.

## Support path

1. **One address.** Publish one support email in the app footer and the
   privacy notice [[COUNSEL: address]]. All requests go there: help, refunds,
   export, deletion, consent withdrawal, takedown.
2. **Reply within 2 working days**, even if only to say it was received.
3. **Sort each message** into one of these:
   - Help / bug: reproduce, fix or explain.
   - Wrong fact in a script: correct it in the app with her and note it.
   - Billing / refund: check credit and billing events; apply the refund policy
     [[COUNSEL]].
   - Export: see below.
   - Deletion: takedown-and-deletion.md, Part B.
   - Consent withdrawal: consent-record.md.
   - Takedown: takedown-and-deletion.md, Part A.
4. **Verify identity** for anything about data: the request must come from her
   login email, or she confirms by a reply to it.
5. **Keep a private log** (date, kind, outcome). Not in this repository, and no
   creator content in it.

## Backups

1. **Database:** the managed database provider takes daily backups. Check once
   a month in its dashboard that the latest one exists and note the retention
   period [[COUNSEL: disclose it]].
2. **Files:** storage buckets are not covered by database backups. Once a month,
   copy the buckets to a second private location the owner controls.
3. **Test a restore** every quarter: restore the database backup into a
   separate test project and open a few rows. Never restore over production.
4. **Code and migrations** live in the repository, which is its own backup.
5. **Secrets** are never in backups you make by hand.
6. After a deletion, her data can still be in backups until they age out. Say
   so when confirming the deletion.

## Export for a creator

1. Run the deletion script in dry run (`scripts/ops/deleteCreator.mjs
   --creator=<id>`) to see which tables hold her rows.
2. Export her rows from the main ones (answers and facts, scripts, transcripts,
   ideas, posts) as CSV or JSON from the database dashboard, filtered by her id.
3. Download her files from the storage buckets (folders named with her id).
4. Send them in one archive by a private link that expires.
5. Log the export.

A one-command export script is a later item; for the first creator, do it by hand.
