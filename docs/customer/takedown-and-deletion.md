# Takedown and data deletion (DRAFT for counsel review)

> **DRAFT for counsel review. Not legal advice.** Process and engineering design.
> `[[COUNSEL: ...]]` marks decisions for counsel.

## Part A. Takedown process

Twin keeps files private. It puts nothing on the public web unless a creator
publishes to her own social account. So takedown requests come in two kinds:
(1) content in Twin storage, and (2) a post that Twin published for her.

1. **Receive.** Use one published contact address [[COUNSEL: address]]. Log the date.
2. **Acknowledge** within 2 working days [[COUNSEL: period]].
3. **Check completeness.** The request must say who is asking, which content,
   what right is claimed, include a good-faith statement and give contact
   details [[COUNSEL: required elements by law]].
4. **Identify** the creator account and the item. Do not share the
   requester's details with the creator beyond what the law requires.
5. **Act.** Disable access to the item in Twin storage. For a published post,
   tell the creator. If Twin published it, remove it through the publishing
   connection where possible.
6. **Notify the creator**, with a counter-notice route [[COUNSEL]].
7. **Record** the decision, dates and outcome in the owner's private log, not
   in this repository.
8. **Repeat infringers:** [[COUNSEL: policy]].

## Part B. Data deletion path

### Trigger

The trigger is a verified request from the creator (sent from her login email)
or the closing of her account. The owner verifies her identity, checks for
legal holds and for billing records counsel says must be kept, then runs the
script.

### Every table holding a creator's data, in deletion order

Source of truth: `RESIDUAL_TABLES` in `scripts/ops/removeFictionalPanel.mjs`.
It is derived from `supabase/migrations`, and
`scripts/ci/check_panel_remove_coverage.mjs` keeps it complete: a new owner
column fails CI until someone lists it. The cleanup column means:

- `delete`: the script deletes these rows explicitly, in this order.
- `cascade`: ON DELETE CASCADE removes these rows when the auth user is deleted.
- `report`: a row owned by someone else that names her. It is never deleted
  automatically, and it blocks a real run until a person decides.

| # | Table | Key column | Cleanup |
|---|---|---|---|
| 1 | script_batch_results | generation_id (via her generation ids) | delete |
| 2 | generations | user_id | delete |
| 3 | creator_knowledge | owner_id | delete |
| 4 | product_entities | owner_id | delete |
| 5 | brand_voices | owner_id | delete |
| 6 | brands | owner_id | delete |
| 7 | jobs | owner_id | delete |
| 8 | ai_usage_ledger | owner_id | delete |
| 9 | credit_events | user_id | delete |
| 10 | analytics_events | user_id | delete |
| 11 | billing_events | user_id | delete [[COUNSEL: keep for tax?]] |
| 12 | rate_events | user_id | delete |
| 13 | source_script_snapshots | owner_id | delete |
| 14 | own_post_reads | owner_id | delete |
| 15 | brain_note_uses | owner_id | delete |
| 16 | referrals | referrer_id | delete |
| 17 | referrals | invitee_id | delete |
| 18 | platform_connections | owner_id | delete |
| 19 | posts | owner_id | delete |
| 20 | profiles | id | delete |
| 21 | storage objects (all buckets, path starts with her id) | path prefix | delete |
| 22 | auth user | id | delete (clears every row below) |
| 23 | transcripts | owner_id | cascade |
| 24 | gallery_items | owner_id | cascade |
| 25 | subscriptions | user_id | cascade |
| 26 | notifications | user_id | cascade |
| 27 | templates | owner_id | cascade |
| 28 | workspace_members | owner_id, member_id | cascade |
| 29 | workspace_invites | owner_id | cascade |
| 30 | oauth_nonce | owner_id | cascade |
| 31 | media_assets | owner_id | cascade |
| 32 | edit_projects | owner_id | cascade |
| 33 | media_analyses | owner_id | cascade |
| 34 | edit_plans | owner_id | cascade |
| 35 | edit_director_calls | owner_id | cascade |
| 36 | edit_director_decisions | owner_id | cascade |
| 37 | source_capture_intents | owner_id | cascade |
| 38 | source_capture_manifests | owner_id | cascade |
| 39 | edit_outputs | owner_id | cascade |
| 40 | brand_truth_snapshots | owner_id | cascade |
| 41 | campaign_intents | owner_id | cascade |
| 42 | reference_evidence_sets | owner_id | cascade |
| 43 | creative_transfer_plans | owner_id | cascade |
| 44 | edit_review_overlays | owner_id | cascade |
| 45 | brand_glossary_terms | owner_id | cascade |
| 46 | post_outcome_observations | owner_id | cascade |
| 47 | dna_claims | owner_id | cascade |
| 48 | post_attributions | owner_id | cascade |
| 49 | audience_questions | owner_id | cascade |
| 50 | script_edits | owner_id | cascade |
| 51 | creator_questions_put | owner_id | cascade |
| 52 | script_attempts | owner_id | cascade |
| 53 | generation_choices | owner_id | cascade |
| 54 | publish_intents | owner_id | cascade |
| 55 | media_upload_attempts | owner_id | cascade |
| 56 | talking_head_overrides | owner_id | cascade |
| 57 | scan_events | user_id | cascade |
| 58 | entry_impressions | owner_id | cascade |
| 59 | scraped_posts | owner_id | cascade |
| 60 | generation_outcomes | owner_id | cascade |
| 61 | creator_knowledge_uses | owner_id | cascade |
| 62 | brain_notes | owner_id | cascade |
| 63 | creator_ideas | owner_id | cascade |
| 64 | script_ratings | owner_id | cascade |
| 65 | audience_tests | owner_id | cascade |
| 66 | audience_panels | owner_id | cascade |
| 67 | post_questions | owner_id | cascade |
| 68 | creator_mentions | owner_id | cascade |
| 69 | creator_shifts | owner_id | cascade |
| 70 | shift_searches | owner_id | cascade |
| 71 | post_stat_snapshots | owner_id | cascade |
| 72 | creator_seasonal_ideas | owner_id | cascade |
| 73 | creator_lessons | owner_id | cascade |
| 74 | comment_candidates | owner_id | cascade |
| 75 | lesson_misses | owner_id | cascade |
| 76 | fact_purpose_votes | owner_id | cascade |
| 77 | question_asks | owner_id | cascade |
| 78 | story_passages | owner_id | cascade |
| 79 | platform_admins | user_id | cascade |
| 80 | workspace_invites | accepted_by | report |
| 81 | visual_pilot_events | reviewer | report |

After the deletion, run the dry run again. Every count should be 0.

**Backups:** her data stays in the provider's backups until they age out
[[COUNSEL: disclose the period]].

The script leaves some data alone by design:

- `eval_consents`: pseudonymous, with no owner id.
- `ops_events`: holds counts only, no ids.
- Aggregated metrics views.
- Niche research tables, which are not keyed to a creator.

The payment processor handles billing records on its side [[COUNSEL: retention]].

### Script: `scripts/ops/deleteCreator.mjs`

- **Dry run is the default.** `--creator=<uuid>` on its own prints per-table
  counts and storage object counts. It deletes nothing.
- **A real deletion needs `--confirm` AND the operator typing the creator id
  again** at a prompt (or `--typed-id=<uuid>` in a non-interactive run). Any
  mismatch is refused and nothing is deleted.
- It refuses if the creator does not exist, or if any `report` row names her.
- It prints counts only, never content.
- Tests: `packages/shared/src/__tests__/deleteCreator.test.ts`, with fictional
  ids and a mock client only. Nobody has run the script against real data.

Owner steps:

```
node scripts/ops/deleteCreator.mjs --creator=<id>            # dry run: read the counts
node scripts/ops/deleteCreator.mjs --creator=<id> --confirm  # then type the id
node scripts/ops/deleteCreator.mjs --creator=<id>            # fails "creator not found" = gone
```

Then reply to the creator to confirm the deletion and explain the backup caveat.
