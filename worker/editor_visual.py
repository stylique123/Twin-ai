#!/usr/bin/env python3
"""Editor v2 Phase 6 — visual analysis bridge (OpenCV + pinned YuNet).

Produces the RAW evidence for the immutable `visual` component:
  * a bounded coarse motion curve (meanAbsLumaDiff/255 between consecutive
    coarse samples at 160x90 grayscale)
  * shot-boundary CANDIDATES (threshold 0.30, fine-refined within a bounded
    budget, merged within 500 ms) — evidence, never cuts
  * YuNet face detections in DISPLAY-SPACE coordinates on evenly-spaced
    coarse samples

Determinism: fixed sampling schedule derived from --interval-ms (computed by
the worker: max(2000, roundUpTo(ceil(durationMs/900), 500))); sequential
decode for the coarse pass; keyframe-seek + forward decode for the bounded
fine pass. All thresholds come from the frozen rules document passed via
--rules — this script carries NO private numeric copies.

Model pinning mirrors editor_speech.py: with --require-pinned-model the
.onnx bytes are sha256-verified against --model-manifest BEFORE load; any
defect exits 3 (the worker maps it to the PERMANENT `model_pin_failed`).

Exit codes: 0 ok, 3 model pin failed, 4 display-dimension mismatch,
1 any other failure.
"""
import argparse
import hashlib
import json
import sys
import time


class PinFailed(Exception):
    pass


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical_json(value) -> str:
    """Must match editorManifest.ts canonicalJson: sorted keys, no spaces."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def verify_model(manifest_path: str, model_path: str):
    """Verify the .onnx against the pin manifest; return the identity block."""
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    manifest.pop("_comment", None)
    files = manifest.get("files") or {}
    if len(files) != 1:
        raise PinFailed("model_pin_failed: vision manifest must pin exactly one artifact")
    (name, want), = files.items()
    got = sha256_file(model_path)
    if got != want:
        raise PinFailed(f"model_pin_failed: {name} sha256 mismatch")
    return {
        "repository": manifest.get("repository"),
        "ref": manifest.get("ref"),
        "artifactSha256": want,
        "manifestSha256": hashlib.sha256(canonical_json(manifest).encode("utf-8")).hexdigest(),
        "verified": True,
    }


def letterbox_detect(detector, frame, input_size, cv2):
    """Letterbox `frame` into input_size x input_size, detect, map boxes back."""
    fh, fw = frame.shape[:2]
    scale = input_size / max(fw, fh)
    nw, nh = max(1, round(fw * scale)), max(1, round(fh * scale))
    resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)
    import numpy as np
    canvas = np.zeros((input_size, input_size, 3), dtype=resized.dtype)
    canvas[:nh, :nw] = resized
    detector.setInputSize((input_size, input_size))
    _, faces = detector.detect(canvas)
    out = []
    if faces is not None:
        for f in faces:
            x, y, w, h = f[0] / scale, f[1] / scale, f[2] / scale, f[3] / scale
            score = float(f[14]) if len(f) > 14 else float(f[-1])
            # Clamp to the display frame; drop degenerate boxes.
            x0 = max(0.0, min(x, fw)); y0 = max(0.0, min(y, fh))
            x1 = max(0.0, min(x + w, fw)); y1 = max(0.0, min(y + h, fh))
            if x1 - x0 < 1 or y1 - y0 < 1:
                continue
            out.append({
                "x": int(round(x0)), "y": int(round(y0)),
                "width": int(round(x1 - x0)), "height": int(round(y1 - y0)),
                "score": round(score, 4),
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--rules", required=True, help="frozen analysis_rules_v1.json")
    ap.add_argument("--model", required=True, help="pinned YuNet .onnx path")
    ap.add_argument("--model-manifest", required=True)
    ap.add_argument("--require-pinned-model", action="store_true")
    ap.add_argument("--duration-ms", type=int, required=True)
    ap.add_argument("--interval-ms", type=int, required=True,
                    help="coarse interval computed by the worker (single producer)")
    ap.add_argument("--display-width", type=int, required=True)
    ap.add_argument("--display-height", type=int, required=True)
    ap.add_argument("--rotation", type=int, default=0)
    # Matrix-only deterministic hold so mid-visual cancellation is provable.
    ap.add_argument("--hold-at", default="")  # after_open | after_coarse
    ap.add_argument("--hold-ms", type=int, default=0)
    args = ap.parse_args()

    with open(args.rules, "r", encoding="utf-8") as f:
        rules_doc = json.load(f)
    rules_doc.pop("_comment", None)
    R = rules_doc["visual"]

    try:
        identity = verify_model(args.model_manifest, args.model)
    except PinFailed as e:
        print(str(e)[:200], file=sys.stderr)
        return 3
    except Exception as e:
        if args.require_pinned_model:
            print(f"model_pin_failed: {e}"[:200], file=sys.stderr)
            return 3
        raise

    import cv2
    import numpy as np

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print("visual: cannot open video", file=sys.stderr)
        return 1
    # Apply container rotation metadata so frames are display-space.
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if fps <= 0 or fps > 1000:
        print("visual: unusable frame rate", file=sys.stderr)
        return 1

    if args.hold_at == "after_open" and args.hold_ms > 0:
        time.sleep(args.hold_ms / 1000.0)

    duration_ms = args.duration_ms
    interval_ms = args.interval_ms
    targets = list(range(0, duration_ms, interval_ms))[: R["coarseMaxSamples"]]

    # Face sampling: evenly-spaced subset of the coarse schedule, <= faceMaxSamples.
    n_face = min(len(targets), R["faceMaxSamples"])
    if n_face <= 1:
        face_set = set(range(len(targets)))
    else:
        face_set = {round(i * (len(targets) - 1) / (n_face - 1)) for i in range(n_face)}

    detector = cv2.FaceDetectorYN_create(
        args.model, "", (R["face"]["inputSize"], R["face"]["inputSize"]),
        R["face"]["scoreThreshold"], R["face"]["nmsThreshold"], R["face"]["topK"])

    dw, dh = args.display_width, args.display_height
    mw, mh = R["motionDownscaleWidth"], R["motionDownscaleHeight"]

    def to_display(frame):
        fh, fw = frame.shape[:2]
        if (fw, fh) == (dw, dh):
            return frame
        if (fw, fh) == (dh, dw):
            # Orientation metadata was NOT applied by the decoder — apply it.
            rot = ((args.rotation % 360) + 360) % 360
            if rot == 90:
                return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
            if rot == 180:
                return cv2.rotate(frame, cv2.ROTATE_180)
            if rot == 270:
                return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
        return None  # genuine dimension mismatch — fail closed

    def small_gray(frame):
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return cv2.resize(g, (mw, mh), interpolation=cv2.INTER_AREA)

    # ---- coarse sequential pass ----
    frame_targets = [round(t * fps / 1000.0) for t in targets]
    motion = []          # [{timeMs, diff}]
    face_samples = []    # [{timeMs, detections}]
    coarse_grays = []    # small grays per coarse sample (for fine bracketing)
    prev_small = None
    frame_idx = -1
    dims_ok = True
    for k, want_idx in enumerate(frame_targets):
        got = None
        while frame_idx < want_idx:
            if not cap.grab():
                break
            frame_idx += 1
        if frame_idx == want_idx:
            ok, got = cap.retrieve()
            if not ok:
                got = None
        if got is None:
            break  # past end of stream — remaining targets are unreachable
        disp = to_display(got)
        if disp is None:
            dims_ok = False
            break
        sg = small_gray(disp)
        coarse_grays.append(sg)
        if prev_small is not None:
            diff = round(float(np.mean(np.abs(sg.astype(np.int16) - prev_small.astype(np.int16)))) / 255.0, 4)
            motion.append({"timeMs": targets[k], "diff": diff})
        prev_small = sg
        if k in face_set:
            face_samples.append({"timeMs": targets[k], "detections": letterbox_detect(detector, disp, R["face"]["inputSize"], cv2)})
    if not dims_ok:
        print("visual: frame dimensions match neither display nor pre-rotation size", file=sys.stderr)
        return 4

    n_coarse = len(coarse_grays)
    if args.hold_at == "after_coarse" and args.hold_ms > 0:
        time.sleep(args.hold_ms / 1000.0)

    # ---- candidates + bounded fine refinement ----
    threshold = R["sceneCutThreshold"]
    candidates = [m for m in motion if m["diff"] >= threshold][: R["shotCandidateCap"]]
    fine_budget = R["fineMaxSamples"]
    fine_used = 0
    boundaries = []
    for c in candidates:
        t1 = c["timeMs"]
        t0 = t1 - interval_ms
        codes = ["luma_diff_threshold"]
        refined_ms = t1
        steps = R["fineSubdivide"]
        if fine_used + (steps - 1) <= fine_budget and steps > 1:
            fine_times = [t0 + round(j * interval_ms / steps) for j in range(1, steps)]
            prev = None
            k0 = targets.index(t0) if t0 in targets else None
            if k0 is not None and k0 < n_coarse:
                prev = coarse_grays[k0]
            found = None
            for ft in fine_times:
                idx = round(ft * fps / 1000.0)
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ok, fr = cap.read()
                fine_used += 1
                if not ok:
                    break
                disp = to_display(fr)
                if disp is None:
                    continue
                sg = small_gray(disp)
                if prev is not None:
                    d = float(np.mean(np.abs(sg.astype(np.int16) - prev.astype(np.int16)))) / 255.0
                    if d >= threshold and found is None:
                        found = ft
                prev = sg
            if found is not None:
                refined_ms = found
                codes.append("fine_refined")
            else:
                codes.append("fine_refined")  # refinement ran; boundary stays at the coarse sample
        else:
            codes.append("fine_budget_exhausted")
        boundaries.append({"timeMs": refined_ms, "score": c["diff"], "evidenceCodes": codes})

    # Merge boundaries within sceneMergeWindowMs (keep the higher score).
    boundaries.sort(key=lambda b: (b["timeMs"], -b["score"]))
    merged = []
    for b in boundaries:
        if merged and b["timeMs"] - merged[-1]["timeMs"] <= R["sceneMergeWindowMs"]:
            if b["score"] > merged[-1]["score"]:
                merged[-1] = b
        else:
            merged.append(b)

    with_face = sum(1 for s in face_samples if s["detections"])
    out = {
        "fps": round(fps, 4),
        "coarseSamples": n_coarse,
        "fineSamples": fine_used,
        "faceSamples": len(face_samples),
        "motion": motion,
        "shotBoundaries": merged,
        "faces": face_samples,
        "faceCoverage": {"samplesWithFace": with_face, "samplesTotal": len(face_samples)},
        "model": {**identity, "opencvVersion": cv2.__version__},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
