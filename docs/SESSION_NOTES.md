# TwinAI — session deploy log

Fixes shipped this session (all verified against the live system):

- (OBSOLETE — Revideo removed with the old editor) Revideo premium one-flow: fixed OOM-restart (REVIDEO_WORKERS=2 + swap, reproducible deploy-revideo.yml). Premium captions now upgrade the edit in place.
- DNA spoken-voice upgrade: fixed SSRF allowlist + route Instagram via permalink->Apify (IG CDN is IP-bound). Voice now built from real spoken transcripts.
- DNA + blueprint quality: full reasoning (GEMINI_THINKING_BUDGET=0), performance-weighted DNA, hook formulas, creator-specific blueprint hooks + first-frame spec.
- Gallery niche: source niche from the brand voice (not the empty quiz field), semantic resolve, and a for-you ranking (your niche first, then related).
