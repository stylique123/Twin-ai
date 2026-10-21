# Consent record for the first real creator (DRAFT for counsel review)

> **DRAFT for counsel review. Not legal advice.** Design of what she agrees to,
> how the record is kept, and how she withdraws.

## What she agrees to

A short written agreement, signed (e-signature or an unambiguous email reply)
**before** she uploads anything. Each statement below is a separate line she
can read, not one checkbox:

1. **Purpose.** Twin uses her uploads, voice, answers and public posts to write
   scripts and edit videos for her.
2. **Who sees it.** The owner and named operators, only to run and fix the
   service.
3. **Processors.** Her transcripts, answers and product facts are sent to an AI
   model provider; public posts are collected by a web collection service;
   files are held by hosting providers (categories as in the privacy notice).
4. **No public or marketing use** of her material or likeness without separate
   written permission.
5. **No model training** on her material by Twin; no voice or face clone.
   [[COUNSEL: align with the AI provider's terms.]]
6. **Review before posting.** Output is a draft; she approves everything she posts.
7. **Retention** while the account is open, deletion on request
   (takedown-and-deletion.md) [[COUNSEL: periods]].
8. **Right to withdraw** at any time, and what happens when she does.
9. [[COUNSEL: credits/payment terms, if she pays.]]

## How it is stored

Follow the precedent of `eval_consents` (migration 0174): **the signed document
is kept outside the database**, separate from her recordings.

- The signed PDF or email goes in the owner's private document store, filed
  under her account id and the date.
- The owner's private register gets a row: account id, document location,
  version of the text she signed, date signed, date withdrawn (empty while live).
- Nothing about the consent goes in this public repository.

### Is a migration needed?

**No, not for the first creator.** One person can be tracked in the owner's
private register, and the document is the evidence. `eval_consents` does not
fit (its fixed attestations say "not published or marketing", which is about
eval recordings, and it has no account id), and changing it would blur its
purpose.

Revisit once there are more than a handful of creators or the product must
check consent before processing. Then add a `creator_consents` table: owner id
(cascade on delete), document version, signed_at, withdrawn_at (nullable
timestamp, never a boolean, as 0174 does), RLS service-role only, and a check
in the upload path. No migration file is written in this change, so
`scripts/ci/check_staging_migration_coverage.mjs` is unchanged.

## How to withdraw

1. She emails support (support-and-backups.md) or tells the owner in writing.
2. The owner fills in "date withdrawn" in the register the same day and pauses
   her account's processing [[COUNSEL: what "pause" must mean]].
3. Ask whether she also wants deletion. If yes, follow the deletion path in
   takedown-and-deletion.md.
4. Confirm to her in writing. Posts she already made stay on her own accounts
   under her control.
