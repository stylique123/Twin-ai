#!/usr/bin/env python3
"""Benchmark the Phase 5 speech bridge with the SHIPPED `small` model.

Measures what the reviewer requires before merging/deploying Phase 5:
  * processing ratio  = transcribe wall time / audio duration (lower is better)
  * peak RSS          = max resident memory of the bridge child (MiB)
  * timeout behaviour = a run that exceeds --timeout-sec is killed
  * cancellation      = SIGTERM to the process GROUP mid-run exits within grace
  * safe concurrency  = N parallel bridges; per-run ratio + wall time so you can
                        see where CPU contention makes it unsafe

Run on the PRODUCTION VPS before merge (authoritative), and/or in CI for an
indicative x86 number (NOT the VPS). Stdlib only — no new deps.

  python worker/scripts/bench_speech.py --audio clip.wav --model small \
      --runs 3 --concurrency 2 --timeout-sec 120
"""
import argparse
import contextlib
import json
import os
import re
import resource
import signal
import subprocess
import sys
import time
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE = os.path.join(HERE, "..", "editor_speech.py")
MANIFEST = os.path.join(HERE, "..", "models", "faster-whisper-small.manifest.json")
# When set (production image / CI), benchmark the PINNED snapshot loaded offline —
# the same weights the immutable component ships — not the moving `small` alias.
MODEL_PATH = os.environ.get("EDITOR_SPEECH_MODEL_PATH", "")


def wav_seconds(path):
    with contextlib.closing(wave.open(path, "rb")) as w:
        return w.getnframes() / float(w.getframerate())


def bridge_cmd(audio, out, model):
    cmd = [sys.executable, BRIDGE, "--audio", audio, "--out", out,
           "--model", model, "--device", "cpu", "--language", "en",
           "--beam-size", "1", "--max-seconds", "1800"]
    if MODEL_PATH:
        cmd += ["--model-path", MODEL_PATH, "--model-manifest", MANIFEST]
    return cmd


def run_once(audio, model, timeout_sec):
    """One bridge run in its own process group. Returns (secs, rss_mib, rc, timed_out)."""
    out = audio + ".bench.json"
    t0 = time.monotonic()
    p = subprocess.Popen(bridge_cmd(audio, out, model), start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    timed_out = False
    try:
        rc = p.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(p.pid, signal.SIGKILL)
        rc = p.wait()
    secs = time.monotonic() - t0
    with contextlib.suppress(FileNotFoundError):
        os.remove(out)
    # ru_maxrss is KiB on Linux for the reaped children (cumulative high-water).
    rss_mib = round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024.0, 1)
    return secs, rss_mib, rc, timed_out


def test_cancellation(audio, model, kill_after_ms):
    """SIGTERM the bridge process GROUP mid-run; report time-to-exit."""
    out = audio + ".cancel.json"
    p = subprocess.Popen(bridge_cmd(audio, out, model), start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(kill_after_ms / 1000.0)
    t0 = time.monotonic()
    running = p.poll() is None
    with contextlib.suppress(ProcessLookupError):
        os.killpg(p.pid, signal.SIGTERM)
    try:
        p.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        p.wait()
    with contextlib.suppress(FileNotFoundError):
        os.remove(out)
    return {"was_running_at_signal": running, "time_to_exit_sec": round(time.monotonic() - t0, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True, help="mono 16k wav (a real speech clip)")
    ap.add_argument("--model", default=os.environ.get("EDITOR_SPEECH_MODEL", "small"))
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--timeout-sec", type=float, default=180.0)
    ap.add_argument("--cancel-after-ms", type=int, default=1500)
    ap.add_argument("--label", default="ci-indicative")
    ap.add_argument("--limits", default=os.path.join(HERE, "bench_thresholds.json"),
                    help="predefined capacity limits (pass/fail)")
    ap.add_argument("--gate", action="store_true",
                    help="exit non-zero if any predefined limit fails (use on the VPS; omit for indicative CI)")
    ap.add_argument("--candidate-sha", default="",
                    help="exact 40-hex git commit the candidate image was built from (recorded + gated)")
    ap.add_argument("--require-identity", action="store_true",
                    help="capture + gate the runtime-observed pinned model identity (repo/revision/digests)")
    args = ap.parse_args()

    dur = wav_seconds(args.audio)
    report = {"label": args.label, "model": args.model, "audio_seconds": round(dur, 2),
              "cpu_count": os.cpu_count(), "serial": [], "concurrent": {}, "cancellation": {}, "timeout": {}}

    print(f"benchmarking {args.model} on {dur:.1f}s clip ({args.runs} serial runs)...")
    for i in range(args.runs):
        secs, rss, rc, to = run_once(args.audio, args.model, args.timeout_sec)
        row = {"run": i, "transcribe_sec": round(secs, 2), "processing_ratio": round(secs / dur, 3),
               "peak_rss_mib": rss, "exit_code": rc, "timed_out": to}
        report["serial"].append(row)
        print(f"  run {i}: ratio {row['processing_ratio']}x  rss {rss} MiB  rc {rc}")

    ratios = [r["processing_ratio"] for r in report["serial"] if not r["timed_out"]]
    report["processing_ratio_median"] = round(sorted(ratios)[len(ratios) // 2], 3) if ratios else None
    report["peak_rss_mib"] = max((r["peak_rss_mib"] for r in report["serial"]), default=None)

    if args.concurrency > 1:
        print(f"concurrency: {args.concurrency} parallel bridges...")
        outs = [args.audio + f".c{i}.json" for i in range(args.concurrency)]
        t0 = time.monotonic()
        procs = [subprocess.Popen(bridge_cmd(args.audio, outs[i], args.model), start_new_session=True,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for i in range(args.concurrency)]
        rcs = [p.wait() for p in procs]
        wall = time.monotonic() - t0
        for o in outs:
            with contextlib.suppress(FileNotFoundError):
                os.remove(o)
        report["concurrent"] = {
            "n": args.concurrency, "wall_sec": round(wall, 2),
            "aggregate_processing_ratio": round(wall / dur, 3),
            "peak_rss_mib_children": round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024.0, 1),
            "all_ok": all(rc == 0 for rc in rcs),
        }
        print(f"  {args.concurrency}x wall {wall:.1f}s (aggregate ratio {report['concurrent']['aggregate_processing_ratio']}x)")

    print("cancellation: SIGTERM mid-run...")
    report["cancellation"] = test_cancellation(args.audio, args.model, args.cancel_after_ms)
    print(f"  time-to-exit {report['cancellation']['time_to_exit_sec']}s")

    print("timeout: 1s cap must kill a real run...")
    _, _, rc, to = run_once(args.audio, args.model, timeout_sec=1.0)
    report["timeout"] = {"cap_sec": 1.0, "timed_out": to, "killed": rc != 0 or to}
    print(f"  timed_out={to}")

    # ---- runtime-observed model identity (bind the bench to the pinned bytes) --
    # One extra bridge run with --require-pinned-model: the bridge verifies the
    # loaded dir against the manifest and emits repo/revision/digests/bundle. The
    # gate proves the CANDIDATE IMAGE (not a stale cache) ran the pinned weights.
    report["candidateSha"] = args.candidate_sha
    report["modelIdentity"] = None
    identity_checks = []
    if args.require_identity or MODEL_PATH:
        expected = {}
        with contextlib.suppress(Exception):
            import fetch_model as _fm  # single source of truth for the manifest digest
            with open(MANIFEST) as fh:
                m = json.load(fh)
            expected = {"repository": m["repository"], "revision": m["revision"],
                        "artifactSha256": m["files"]["model.bin"], "analyzerBundle": m.get("analyzerBundle"),
                        "manifestSha256": _fm.manifest_sha256(m)}
        idout = args.audio + ".identity.json"
        idcmd = bridge_cmd(args.audio, idout, args.model) + ["--require-pinned-model"]
        idp = subprocess.run(idcmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        identity = None
        if idp.returncode == 0:
            with contextlib.suppress(Exception):
                with open(idout) as fh:
                    identity = json.load(fh).get("model")
        with contextlib.suppress(FileNotFoundError):
            os.remove(idout)
        report["modelIdentity"] = identity

        def idchk(name, ok):
            identity_checks.append({"name": name, "pass": bool(ok)})

        idchk("bridge_verified_ok", idp.returncode == 0 and identity is not None)
        idchk("loaded_from_path", bool(identity and identity.get("loadedFromPath")))
        idchk("verified", bool(identity and identity.get("verified")))
        idchk("repository", identity and identity.get("repository") == expected.get("repository"))
        idchk("revision", identity and identity.get("revision") == expected.get("revision"))
        idchk("artifact_sha256", identity and identity.get("artifactSha256") == expected.get("artifactSha256"))
        idchk("manifest_sha256", identity and expected.get("manifestSha256")
              and identity.get("manifestSha256") == expected.get("manifestSha256"))
        idchk("analyzer_bundle", identity and identity.get("analyzerBundle") == expected.get("analyzerBundle") == "speech-6")
        if args.require_identity:
            idchk("candidate_sha_is_40hex", bool(re.fullmatch(r"[0-9a-f]{40}", args.candidate_sha or "")))
        report["identityGate"] = {"expected": expected, "checks": identity_checks,
                                  "allPass": all(c["pass"] for c in identity_checks)}

    # ---- pass/fail against PREDEFINED capacity limits -----------------------
    limits = {}
    with contextlib.suppress(Exception):
        with open(args.limits) as fh:
            limits = json.load(fh)
    checks = []

    def chk(name, value, ok, limit):
        checks.append({"name": name, "value": value, "limit": limit, "pass": bool(ok)})

    if limits:
        chk("processing_ratio_median", report["processing_ratio_median"],
            report["processing_ratio_median"] is not None and report["processing_ratio_median"] <= limits["maxProcessingRatioMedian"],
            f"<= {limits['maxProcessingRatioMedian']}")
        chk("peak_rss_mib", report["peak_rss_mib"],
            report["peak_rss_mib"] is not None and report["peak_rss_mib"] <= limits["maxPeakRssMib"],
            f"<= {limits['maxPeakRssMib']}")
        chk("cancel_exit_sec", report["cancellation"].get("time_to_exit_sec"),
            report["cancellation"].get("time_to_exit_sec", 1e9) <= limits["maxCancelExitSec"],
            f"<= {limits['maxCancelExitSec']}")
        chk("timeout_kills", report["timeout"].get("killed"),
            (report["timeout"].get("killed") is True) or (not limits.get("timeoutMustKill", True)),
            "must kill")
        if report["concurrent"]:
            chk("concurrent_all_ok", report["concurrent"].get("all_ok"),
                report["concurrent"].get("all_ok") is True or not limits.get("requireConcurrentAllOk", True),
                "all rc=0")
            chk("concurrent_aggregate_ratio", report["concurrent"].get("aggregate_processing_ratio"),
                report["concurrent"].get("aggregate_processing_ratio", 1e9) <= limits["maxConcurrentAggregateRatio"],
                f"<= {limits['maxConcurrentAggregateRatio']}")
        report["gate"] = {"limits": limits, "checks": checks, "allPass": all(c["pass"] for c in checks)}

    print("\n=== BENCH REPORT ===")
    print(json.dumps(report, indent=2))
    with open("speech-bench-report.json", "w") as fh:
        json.dump(report, fh, indent=2)
    print("report → speech-bench-report.json")

    identity_ok = (not identity_checks) or all(c["pass"] for c in identity_checks)
    if identity_checks:
        print("\n=== model identity gate ===")
        for c in identity_checks:
            print(f"  {'PASS' if c['pass'] else 'FAIL'} {c['name']}")
        mi = report.get("modelIdentity") or {}
        print(f"  observed: {mi.get('repository')}@{mi.get('revision')} bundle={mi.get('analyzerBundle')} "
              f"verified={mi.get('verified')} candidateSha={args.candidate_sha or '(none)'}")
        print(f"MODEL IDENTITY GATE: {'PASS' if identity_ok else 'FAIL'}")

    if limits:
        print("\n=== capacity gate ===")
        for c in checks:
            print(f"  {'PASS' if c['pass'] else 'FAIL'} {c['name']}={c['value']} (need {c['limit']})")
        allpass = report["gate"]["allPass"]
        print(f"CAPACITY GATE: {'PASS' if allpass else 'FAIL'}"
              + ("" if args.gate else "  (indicative — not enforced; run on the VPS with --gate to enforce)"))

    # Under --gate (the authoritative VPS run) BOTH the capacity limits and the
    # runtime-observed model identity must pass.
    if args.gate and not (report.get("gate", {}).get("allPass", True) and identity_ok):
        sys.exit(1)


if __name__ == "__main__":
    main()
