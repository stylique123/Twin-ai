// GENERATED from packages/shared/src/script/realisticPanel.ts by scripts/ci/generate_ops_mjs_copies.mjs. Do not edit.
const COST_MODES = ["test", "checkpoint", "full"];
const EXTRAS = [
  "product_pages",
  "pain_map",
  "personas",
  "outside_knowledge",
  "audience_comments",
  "niche_notes"
];
const DEFAULT_EXTRA_CAPS_USD = {
  product_pages: 0.25,
  // Apify reads of public product pages (~$0.002/read) + AI extraction
  pain_map: 0,
  // hand-written or fictional map: no spend
  personas: 1,
  // practice viewers (AI calls)
  outside_knowledge: 0.3,
  audience_comments: 0.3,
  // her own audience first
  niche_notes: 0.2
};
const ALL_OFF = () => Object.fromEntries(EXTRAS.map((e) => [e, false]));
function flagOn(v, dflt) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "") return dflt;
  if (["0", "off", "false", "no"].includes(s)) return false;
  if (["1", "on", "true", "yes"].includes(s)) return true;
  return dflt;
}
function resolveCostMode(input) {
  if (input.account !== "test" && input.account !== "panel") return { mode: "live", applies: false, extras: ALL_OFF() };
  const req = String(input.requested ?? "").trim().toLowerCase();
  const mode = COST_MODES.includes(req) ? req : "test";
  const extras = ALL_OFF();
  if (mode === "full") for (const e of EXTRAS) extras[e] = flagOn(input.flags?.[e], true);
  return { mode, applies: true, extras };
}
const MARKETPLACE_BLOCKLIST = [
  "amazon",
  "amzn",
  "etsy",
  "ebay",
  "walmart",
  "aliexpress",
  "alibaba",
  "temu",
  "shein",
  "wish",
  "target",
  "bestbuy",
  "mercadolibre",
  "mercadolivre",
  "rakuten",
  "shopee",
  "lazada",
  "flipkart",
  "allegro",
  "zalando",
  "bol",
  "otto",
  "cdiscount",
  "wayfair",
  "poshmark",
  "depop",
  "vinted",
  "facebook",
  "tiktok",
  "instagram"
];
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|(?:\d{1,3}\.){3}\d{1,3}|\[.*\])$/i;
const PRIVATE_PATH = /\/(?:account|accounts|login|signin|sign-in|checkout|cart|admin|dashboard|my|orders|wp-admin|settings)(?:\/|$)/i;
const SECRET_QUERY = /[?&](?:token|key|apikey|api_key|auth|session|sig|signature|password|code)=/i;
function isMarketplaceHost(host) {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  return labels.some((l) => MARKETPLACE_BLOCKLIST.includes(l));
}
const refuse = (reason) => ({ read: false, source: "none", reason, nameSearchFallback: false });
function planProductPageRead(input) {
  if (!input.decision.applies) return refuse("not_test_or_panel");
  if (input.decision.mode !== "full") return refuse("mode_not_full");
  if (!input.decision.extras.product_pages) return refuse("extra_off");
  const raw = typeof input.url === "string" ? input.url.trim() : "";
  if (!raw) return refuse("no_url");
  let u;
  try {
    u = new URL(raw);
  } catch {
    return refuse("bad_url");
  }
  if (u.protocol !== "https:") return refuse("not_https");
  if (u.username || u.password || PRIVATE_HOST.test(u.hostname)) return refuse("private_host");
  if (PRIVATE_PATH.test(u.pathname)) return refuse("private_path");
  if (SECRET_QUERY.test(u.search)) return refuse("secret_in_url");
  if (isMarketplaceHost(u.hostname) && input.counselMarketplaceOk !== true) return refuse("marketplace_until_counsel");
  if (input.hasSnapshot) return { read: true, source: "snapshot", reason: "snapshot", nameSearchFallback: false };
  if (input.offline) return refuse("no_snapshot_offline");
  return { read: true, source: "apify_policy_v2", reason: "live_via_apify_guard", nameSearchFallback: false };
}
function afterFailedPageRead() {
  return { nameSearch: false, useExtracted: false };
}
const NEVER_SPOKEN_UNCONFIRMED = ["proof_number", "testimonial", "comparison"];
const FIGURE = /[$£€¥]\s?\d|\d+(?:[.,]\d+)?\s?(?:%|x\b|percent|users|customers|people|reviews|stars)|\b\d{3,}\b/i;
const PRAISE_OR_RIVAL = /\b(best|better than|#1|number one|loved by|rated|review|testimonial|vs\.?|versus|cheaper than)\b/i;
function strip(s) {
  return s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
function readFictionalSnapshot(html) {
  if (!/<html[^>]*\bdata-fictional=["']true["']/i.test(html)) return { ok: false, reason: "not_marked_fictional", facts: [] };
  const facts = [];
  const add = (field, raw) => {
    const value = strip(raw ?? "");
    if (!value || value.length > 200) return;
    const risky = field === "price" || FIGURE.test(value) || PRAISE_OR_RIVAL.test(value);
    facts.push({ field, value, speakable: !risky });
  };
  add("name", /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  add("description", /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]);
  add("headline", /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]);
  add("price", /<[^>]+data-price[^>]*>([\s\S]*?)<\//i.exec(html)?.[1]);
  for (const m of html.matchAll(/<a[^>]+data-cta[^>]*>([\s\S]*?)<\/a>/gi)) add("cta", m[1]);
  return { ok: true, reason: "read", facts };
}
const PAIN_MIN_THREADS = 5;
const PAIN_MIN_COMMUNITIES = 2;
const PAIN_MAX_AGE_DAYS = 90;
const PAIN_ENTRY_KEYS = ["topic", "thread_count", "community_count", "links", "first_seen", "last_checked"];
const PAIN_ALLOWED_USES = ["hook", "question", "reality_check"];
const PAIN_FORBIDDEN_USES = ["proof", "her_experience", "quote", "testimonial"];
const QUOTEY = /["“”«»]|(^|\s)'|'(\s|$)/;
const HANDLE = /(^|[^\w])@\w|(^|[^\w/])\/?u\/\w/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function daysBetween(a, b) {
  return Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}
function painEntryProblems(e, today) {
  const r = [];
  if (!e || typeof e !== "object") return ["not_an_object"];
  const x = e;
  for (const k of Object.keys(x)) if (!PAIN_ENTRY_KEYS.includes(k)) r.push(`extra_field_${k.replace(/[^a-z_]/gi, "").slice(0, 24)}`);
  const topic = typeof x.topic === "string" ? x.topic.trim() : "";
  if (!topic) r.push("topic_missing");
  if (topic.length > 120) r.push("topic_too_long");
  if (QUOTEY.test(topic)) r.push("topic_quoted");
  if (HANDLE.test(topic)) r.push("topic_username");
  const t = Number(x.thread_count), c = Number(x.community_count);
  if (!Number.isInteger(t) || t < PAIN_MIN_THREADS) r.push("too_few_threads");
  if (!Number.isInteger(c) || c < PAIN_MIN_COMMUNITIES) r.push("too_few_communities");
  const links = Array.isArray(x.links) ? x.links : [];
  if (!links.length) r.push("no_links");
  for (const l of links) {
    try {
      const u = new URL(String(l));
      if (u.protocol !== "https:") r.push("link_not_https");
    } catch {
      r.push("link_invalid");
    }
  }
  const last = String(x.last_checked ?? "");
  if (!DAY.test(last)) r.push("last_checked_invalid");
  else if (daysBetween(last, today) > PAIN_MAX_AGE_DAYS) r.push("expired");
  if (x.first_seen !== void 0 && !DAY.test(String(x.first_seen))) r.push("first_seen_invalid");
  return [...new Set(r)];
}
function usablePainMap(map, input) {
  const empty = { entries: [], rejected: 0, reasons: {}, allowedUses: PAIN_ALLOWED_USES, fictional: false };
  if (!input.decision.applies || input.decision.mode !== "full" || !input.decision.extras.pain_map) return empty;
  const m = map;
  if (!m || !Array.isArray(m.entries)) return empty;
  if (input.niche && String(m.niche ?? "").trim().toLowerCase() !== input.niche.trim().toLowerCase()) return empty;
  const out = { ...empty, fictional: m.fictional === true };
  for (const e of m.entries) {
    const p = painEntryProblems(e, input.today);
    if (p.length) {
      out.rejected++;
      for (const k of p) out.reasons[k] = (out.reasons[k] ?? 0) + 1;
      continue;
    }
    const x = e;
    out.entries.push({ topic: x.topic.trim(), thread_count: x.thread_count, community_count: x.community_count, links: x.links.map(String), first_seen: x.first_seen ?? x.last_checked, last_checked: x.last_checked });
  }
  return out;
}
function painUseAllowed(use) {
  return PAIN_ALLOWED_USES.includes(use);
}
function painItemsForQuestions(m) {
  return m.entries.slice(0, 3).map((e, i) => ({ id: `pain-${i}`, text: e.topic, origin: "audience_pain" }));
}
function painMapPromptBlock(m) {
  if (!m.entries.length) return "";
  const lines = m.entries.slice(0, 5).map((e) => `- ${e.topic} (${e.thread_count} threads, ${e.community_count} communities)`);
  return [
    "AUDIENCE PAIN TOPICS (public discussion patterns; topics and counts only):",
    ...lines,
    "USE: a hook angle, a question to ask her, or a reality check. NEVER as proof, a statistic, a quote, or something SHE experienced."
  ].join("\n");
}
function redditScanV2Allowed(input) {
  if (input.account !== "test" && input.account !== "panel") return { allowed: false, reason: "real_creator_never" };
  const on = String(input.ownerFlag ?? "").trim().toLowerCase();
  if (on !== "on" && on !== "1" && on !== "true") return { allowed: false, reason: "owner_flag_off" };
  return { allowed: true, reason: "owner_flag_on" };
}
const PERSONA_MIN_CORRELATION = 0.5;
function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, [a]) => s + a, 0) / n, my = pairs.reduce((s, [, b]) => s + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [a, b] of pairs) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  return pearson(ranks(pairs.map((p) => p[0])), ranks(pairs.map((p) => p[1])));
}
function personaMayInfluence(c) {
  if (!c) return false;
  return [c.hook_r, c.craft_r].every((r) => typeof r === "number" && Number.isFinite(r) && r >= PERSONA_MIN_CORRELATION);
}
function selectWithPersonas(cands, calib, weight = 0.3) {
  const by = new Map(calib.map((c) => [c.persona, c]));
  const personas = [...new Set(cands.flatMap((c) => Object.keys(c.personaScores ?? {})))];
  const influencing = personas.filter((p) => personaMayInfluence(by.get(p)));
  const signalOnly = personas.filter((p) => !influencing.includes(p));
  const score = (c) => {
    const vs = influencing.map((p) => c.personaScores?.[p]).filter((v) => typeof v === "number" && Number.isFinite(v));
    return c.baseScore + (vs.length ? weight * (vs.reduce((a, b) => a + b, 0) / vs.length) : 0);
  };
  const ok = cands.filter((c) => c.honestyPassed === true);
  return {
    order: [...ok].sort((a, b) => score(b) - score(a)).map((c) => c.id),
    blocked: cands.filter((c) => c.honestyPassed !== true).map((c) => c.id),
    influencing,
    signalOnly
  };
}
function personaMetadata(scores, calib) {
  const by = new Map(calib.map((c) => [c.persona, c]));
  return Object.entries(scores ?? {}).filter(([, v]) => Number.isFinite(v)).map(([p, v]) => ({ persona: p, score: v, calibrated: personaMayInfluence(by.get(p)) }));
}
class ExtrasLedger {
  spent = {};
  uses = {};
  refusals = {};
  decision;
  caps;
  // Plain fields, not parameter properties: node's type stripping (scripts import this file) cannot erase those.
  constructor(decision, caps = DEFAULT_EXTRA_CAPS_USD) {
    this.decision = decision;
    this.caps = caps;
  }
  /** Reserve spend for one use. False (and counted) when the extra is off or the cap would be passed. */
  charge(extra, usd) {
    if (!this.decision.applies || !this.decision.extras[extra]) {
      this.refusals[extra] = (this.refusals[extra] ?? 0) + 1;
      return false;
    }
    const next = (this.spent[extra] ?? 0) + Math.max(0, usd);
    if (next > this.caps[extra] + 1e-9) {
      this.refusals[extra] = (this.refusals[extra] ?? 0) + 1;
      return false;
    }
    this.spent[extra] = next;
    this.uses[extra] = (this.uses[extra] ?? 0) + 1;
    return true;
  }
  /** Counts and dollars only — no text, no ids, no URLs. */
  report() {
    return Object.fromEntries(EXTRAS.map((e) => [e, {
      on: this.decision.applies && this.decision.extras[e],
      uses: this.uses[e] ?? 0,
      refused: this.refusals[e] ?? 0,
      usd: Math.round((this.spent[e] ?? 0) * 1e4) / 1e4,
      cap_usd: this.caps[e]
    }]));
  }
}
const UNIT_COST_USD = {
  script_ai: 0.06,
  // writer + editor + gates per request (panel history, UNCONFIRMED)
  page_read_apify: 2e-3,
  // one public page, cheapest actor, result limit 1
  page_extract_ai: 4e-3,
  persona_read_ai: 3e-3,
  // per persona per script
  outside_knowledge_ai: 4e-3,
  audience_comments_ai: 3e-3,
  niche_notes_ai: 2e-3
};
function estimatePanelBudget(input) {
  const d = input.decision, n = Math.max(0, input.requests), U = UNIT_COST_USD;
  const lines = [{ provider: "gemini", caller: "script", usd: n * U.script_ai }];
  if (d.applies && d.mode === "full") {
    if (d.extras.product_pages) {
      lines.push({ provider: "apify", caller: "product_pages", usd: input.pageReads * U.page_read_apify });
      lines.push({ provider: "gemini", caller: "product_pages", usd: input.pageReads * U.page_extract_ai });
    }
    if (d.extras.personas) lines.push({ provider: "gemini", caller: "personas", usd: n * input.personas * U.persona_read_ai });
    if (d.extras.outside_knowledge) lines.push({ provider: "gemini", caller: "outside_knowledge", usd: n * U.outside_knowledge_ai });
    if (d.extras.audience_comments) lines.push({ provider: "gemini", caller: "audience_comments", usd: n * U.audience_comments_ai });
    if (d.extras.niche_notes) lines.push({ provider: "gemini", caller: "niche_notes", usd: n * U.niche_notes_ai });
  }
  const r = (x) => Math.round(x * 1e4) / 1e4;
  for (const l of lines) l.usd = r(l.usd);
  const apify = r(lines.filter((l) => l.provider === "apify").reduce((a, l) => a + l.usd, 0));
  const ai = r(lines.filter((l) => l.provider === "gemini").reduce((a, l) => a + l.usd, 0));
  return { lines, apify_usd: apify, ai_usd: ai, total_usd: r(apify + ai) };
}
function budgetGate(b, capUsd) {
  const cap = Number(capUsd);
  if (!Number.isFinite(cap) || cap <= 0) return { ok: false, reason: "no_cap" };
  return b.total_usd <= cap ? { ok: true, reason: "within_cap" } : { ok: false, reason: "over_cap" };
}
function costByCallerAndModel(rows) {
  const m = /* @__PURE__ */ new Map();
  const label = (v) => String(v ?? "unknown").replace(/[^\w.:/-]/g, "").slice(0, 64) || "unknown";
  for (const r of rows) {
    const k = `${label(r.provider)}|${label(r.caller)}|${label(r.model)}`;
    const e = m.get(k) ?? { provider: label(r.provider), caller: label(r.caller), model: label(r.model), usd: 0, rows: 0 };
    const u = Number(r.usd);
    e.usd += Number.isFinite(u) ? u : 0;
    e.rows++;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, usd: Math.round(e.usd * 1e5) / 1e5 })).sort((a, b) => b.usd - a.usd);
}
const EXTRA_ITEM_CAPS = { outside_knowledge: 4, audience_comments: 6, niche_notes: 4 };
const SAFE_ITEM = /^[^@<>{}`]{3,200}$/;
function cleanItems(v, cap) {
  if (!Array.isArray(v) || cap <= 0) return [];
  const out = [];
  for (const x of v) {
    const s = typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";
    if (!s || !SAFE_ITEM.test(s) || HANDLE.test(s) || /https?:\/\//i.test(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}
function buildRealisticContext(input) {
  const used = { pain_map: 0, outside_knowledge: 0, audience_comments: 0, niche_notes: 0 };
  const d = input.decision;
  if (!d.applies || d.mode !== "full") return { block: "", used };
  const parts = [];
  const take = (extra) => !!d.extras[extra] && (!input.ledger || input.ledger.charge(extra, 0));
  if (input.pain && input.pain.entries.length && d.extras.pain_map && take("pain_map")) {
    parts.push(painMapPromptBlock(input.pain));
    used.pain_map = Math.min(5, input.pain.entries.length);
  }
  const x = input.extras && typeof input.extras === "object" ? input.extras : {};
  const outside = cleanItems(x.outside_knowledge, EXTRA_ITEM_CAPS.outside_knowledge);
  if (outside.length && d.extras.outside_knowledge && take("outside_knowledge")) {
    parts.push(["OUTSIDE AND NICHE KNOWLEDGE (general facts about the field; NOT her experience, NOT her numbers):", ...outside.map((s) => `- ${s}`)].join("\n"));
    used.outside_knowledge = outside.length;
  }
  const ac = x.audience_comments && typeof x.audience_comments === "object" ? x.audience_comments : {};
  const own = cleanItems(ac.own, EXTRA_ITEM_CAPS.audience_comments);
  const niche = cleanItems(ac.niche, EXTRA_ITEM_CAPS.audience_comments).filter((s) => !own.includes(s)).slice(0, EXTRA_ITEM_CAPS.audience_comments - own.length);
  if ((own.length || niche.length) && d.extras.audience_comments && take("audience_comments")) {
    parts.push([
      "AUDIENCE WORDS (vocabulary and questions only; never quoted as a testimonial, never proof):",
      ...own.map((s) => `- [her audience] ${s}`),
      ...niche.map((s) => `- [niche audience] ${s}`)
    ].join("\n"));
    used.audience_comments = own.length + niche.length;
  }
  const notes = cleanItems(x.niche_notes, EXTRA_ITEM_CAPS.niche_notes);
  if (notes.length && d.extras.niche_notes && take("niche_notes")) {
    parts.push(["NICHE NOTES (what works in this niche; shape only, NOT facts about her):", ...notes.map((s) => `- ${s}`)].join("\n"));
    used.niche_notes = notes.length;
  }
  return { block: parts.length ? `REALISTIC PANEL CONTEXT (test account)
${parts.join("\n\n")}` : "", used };
}
function withRealisticContext(prompt, ctx) {
  return ctx.block ? `${prompt}

${ctx.block}` : prompt;
}
export {
  COST_MODES,
  DEFAULT_EXTRA_CAPS_USD,
  EXTRAS,
  EXTRA_ITEM_CAPS,
  ExtrasLedger,
  MARKETPLACE_BLOCKLIST,
  NEVER_SPOKEN_UNCONFIRMED,
  PAIN_ALLOWED_USES,
  PAIN_ENTRY_KEYS,
  PAIN_FORBIDDEN_USES,
  PAIN_MAX_AGE_DAYS,
  PAIN_MIN_COMMUNITIES,
  PAIN_MIN_THREADS,
  PERSONA_MIN_CORRELATION,
  UNIT_COST_USD,
  afterFailedPageRead,
  budgetGate,
  buildRealisticContext,
  costByCallerAndModel,
  estimatePanelBudget,
  isMarketplaceHost,
  painEntryProblems,
  painItemsForQuestions,
  painMapPromptBlock,
  painUseAllowed,
  pearson,
  personaMayInfluence,
  personaMetadata,
  planProductPageRead,
  readFictionalSnapshot,
  redditScanV2Allowed,
  resolveCostMode,
  selectWithPersonas,
  spearman,
  usablePainMap,
  withRealisticContext
};
