# Twin privacy notice (DRAFT for counsel review)

> **DRAFT for counsel review. Not legal advice.** Written by engineering from
> what the code actually does, so counsel can turn it into a notice. Every
> `[[COUNSEL: ...]]` is a decision or wording counsel must supply.

## 1. Who we are

[[COUNSEL: legal entity name, address, contact for privacy questions, data
protection representative if needed, which law applies.]]

## 2. What Twin collects and why

| Category | What it is, as built | Why Twin uses it |
|---|---|---|
| Account data | Email and login identity; a profile row; plan and credit balance. | To run the account and charge for use. |
| Creator material | Videos and photos the creator uploads (takes, product photos, logos), plus the edits and finished videos Twin renders from them. | To analyse delivery and build edited videos. |
| Product pages | Product pages and links the creator gives Twin; facts read from them (name, price, offer, claims, reviews, whether still for sale). | So scripts only state true product facts. |
| Voice samples | Recorded speech in her takes, the transcripts made from it, and a "voice card" of how she talks (words, rhythm, phrases). | So scripts sound like her. |
| Answers | Her answers to Twin's questions about herself, her products and her audience; corrections she makes; facts she marks private. | So Twin says only what she has told it. |
| Generated scripts | Scripts, hooks, ideas, ratings, edits she makes to them, and what she chose to post. | To deliver the product and learn her preferences. |
| Her public posts | Her own public social posts, stats and comments (and replies) on supported platforms, read after she connects or names her account. | To learn her style and what worked. |
| Outside sources | Public posts and discussions in her niche (short-video platforms, video sites, forums) and public brand information. | Niche research and trend ideas. Stored as summaries/notes, not as her data. |
| Usage logs | Product events, rate-limit and error events, credit and billing events, and a per-call AI usage ledger (model, tokens, cost; not the content). | Security, billing, cost control, fixing faults. |
| Payments | Handled by a payment processor; Twin keeps billing events and subscription status, not card numbers. | To take payment. |

Twin does **not** use her material to build a voice clone or a face model.
[[COUNSEL: confirm this matches the product promise at launch.]]

## 3. Third parties that process data

Named by category; the operator keeps the vendor list.

- **AI model provider (large language and vision models).** Receives
  transcripts, product facts, her answers and frames/analysis needed to write
  or check a script or edit plan. Raw video files are processed on Twin's own
  worker; speech-to-text runs on Twin's own worker.
  [[COUNSEL: confirm provider terms on training use and retention.]]
- **Public-web collection service.** Fetches public social posts, profiles
  and comments for her account and her niche.
- **Publishing service.** Only if she chooses to publish through Twin: posts
  her finished video to her connected social account.
- **Payment processor.** Card payments and subscriptions.
- **Hosting providers.** Managed database, file storage, web hosting, and a
  processing worker.

[[COUNSEL: list of sub-processors, transfer mechanism for each, DPA status.]]

## 4. Where it is stored

- **Managed database** (one project): account, answers, facts, scripts,
  transcripts, logs. Row-level access rules limit each creator to her own rows.
- **Private file storage buckets** in the same project: takes, edits, post
  media, reference frames, product images. Not public; paths are keyed to her
  account id.
- **Processing worker**: temporary working copies during analysis and
  rendering, removed after the job.
- [[COUNSEL: region/country of each.]]

## 5. How long we keep it

[[COUNSEL: retention periods per category. Engineering proposal: account
content kept while the account is open; deleted within 30 days of a verified
deletion request (see takedown-and-deletion.md); billing records kept as the
law requires; backups age out on the provider's schedule.]]

## 6. Her choices and rights

- See, correct or mark private any fact Twin holds about her (in the app).
- Ask for a copy (export) or deletion (support-and-backups.md,
  takedown-and-deletion.md).
- Withdraw consent (consent-record.md).
- [[COUNSEL: statutory rights by jurisdiction, complaint authority.]]

## 7. Honesty commitment

Twin is built not to invent facts about her, her products or her results.
Scripts are drafts for her to review before posting.

## 8. Changes and contact

[[COUNSEL: change notice, effective date, contact address.]]
