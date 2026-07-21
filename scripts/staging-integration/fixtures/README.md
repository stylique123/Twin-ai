# Staging-integration fixtures

## face_astronaut.jpg

Real-face fixture for the Phase-6 visual analyzer's face-detection gate
(YuNet must detect the face in ≥ 90% of sampled frames of the face segment,
with zero detections on the solid-color segments).

* Subject: NASA photograph of astronaut Eileen Collins — a **U.S. government
  work in the public domain** (NASA imagery is not copyrighted).
* Source: `skimage/data/astronaut.png` from scikit-image v0.24.0
  (`https://raw.githubusercontent.com/scikit-image/scikit-image/v0.24.0/skimage/data/astronaut.png`),
  original sha256
  `7de7ed51a1594fff247f4cae2301eceacf5313d6011e37b4a4c8733f7bb72c07`.
* This file: the original re-encoded to 512×512 JPEG (q4) to keep the repo
  small; sha256
  `6d6d5d5ee045d79aef13e6e009970fc723452803b089324264c44c6941977a2a`.

The fixture VIDEO (black 5s | white 5s | gray+face 5s, 720×1280@30) is
generated at run time by `scripts/staging-integration/phase6.mjs` from this
image — the two luma cuts (0.92 and 0.50 mean-abs-luma diff) sit far above the
frozen 0.30 shot threshold, and the local bridge validation detected the face
at score ≈ 0.86 on every face-segment sample.
