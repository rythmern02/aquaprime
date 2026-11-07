#!/usr/bin/env python3
"""Assemble demo/AquaPrime-demo.mp4 from recorded clips, narration and caption overlays.

Each segment → 1920x1080 30fps H.264 + AAC (voice only), white dip-in/out, timed lower-thirds.
Segments are then concatenated without re-encoding.
"""
import json, os, subprocess

D = os.path.dirname(os.path.abspath(__file__))
C, A, O, B = (os.path.join(D, x) for x in ("clips", "audio", "overlays", "build"))
os.makedirs(B, exist_ok=True)
dur = json.load(open(f"{A}/durations.json"))
app = json.load(open(f"{C}/05-app.beats.json"))
app_trim = json.load(open(f"{C}/05-app.json"))["trim"]
bt, pop = app["beats"], app["popup"]
PAD_IN, TAIL = 0.35, 0.65

def trim_of(n): return json.load(open(f"{C}/{n}.json"))["trim"]
def run(cmd): subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def render(idx, parts, audio, length, caps=(), still=False):
    """parts: list of (file, start, length, speed) video pieces concatenated; caps: (png, from, to)."""
    out = f"{B}/{idx:02d}.mp4"
    inputs, filt, labels = [], [], []
    for i, (f, ss, ln, speed) in enumerate(parts):
        if still: inputs += ["-loop", "1", "-t", f"{length}", "-i", f]
        else: inputs += ["-ss", f"{ss:.3f}", "-t", f"{ln * speed:.3f}", "-i", f]
        filt.append(f"[{i}:v]setpts=PTS-STARTPTS{'' if speed == 1 else f',setpts=PTS/{speed}'},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,setsar=1[v{i}]")
        labels.append(f"[v{i}]")
    k = len(parts)
    filt.append(f"{''.join(labels)}concat=n={k}:v=1:a=0[cat]")
    # pad/trim the picture to the exact segment length, white dips at both ends
    filt.append(f"[cat]tpad=stop_mode=clone:stop_duration=30,trim=0:{length:.3f},setpts=PTS-STARTPTS,"
                f"fade=t=in:st=0:d=0.3:color=white,fade=t=out:st={length - 0.3:.3f}:d=0.3:color=white[base]")
    last = "base"
    for j, (png, a, b) in enumerate(caps):
        b = min(b, length - 0.4)
        if b - a < 1.2: continue
        inputs += ["-loop", "1", "-t", f"{length}", "-i", f"{O}/{png}.png"]
        n = k + j
        filt.append(f"[{n}:v]format=rgba,fade=t=in:st={a:.2f}:d=0.35:alpha=1,fade=t=out:st={b - 0.35:.2f}:d=0.35:alpha=1[o{j}]")
        filt.append(f"[{last}][o{j}]overlay=0:0:format=auto:enable='between(t,{a:.2f},{b:.2f})'[c{j}]")
        last = f"c{j}"
    na = k + len(caps)
    if audio:
        inputs += ["-i", audio]
        filt.append(f"[{na}:a]aresample=48000,adelay={int(PAD_IN * 1000)}|{int(PAD_IN * 1000)},apad,atrim=0:{length:.3f},"
                    f"loudnorm=I=-16:TP=-1.5:LRA=11[aud]")
    else:
        inputs += ["-f", "lavfi", "-t", f"{length}", "-i", "anullsrc=r=48000:cl=stereo"]
        filt.append(f"[{na}:a]atrim=0:{length:.3f}[aud]")
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt), "-map", f"[{last}]", "-map", "[aud]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", out])
    print(f"segment {idx:02d}  {length:5.1f}s")
    return out

def seglen(key, minimum=0.0): return max(dur[key] + PAD_IN + TAIL, minimum)
def aud(n, key): return f"{A}/{n:02d}-{key}.aiff"

segs = []
L = seglen("title"); segs.append(render(0, [(f"{O}/title.png", 0, L, 1)], aud(0, "title"), L, still=True))
for n, key, clip, cap in [(1, "hook", "01-hook", "c-problem"), (2, "field", "02-field", "c-field"), (3, "sim", "03-sim", "c-sim"), (4, "vm", "04-vm", "c-vm")]:
    L = seglen(key); segs.append(render(n, [(f"{C}/{clip}.webm", trim_of(clip), L, 1)], aud(n, key), L, [(cap, 1.2, L - 0.6)]))

V = f"{C}/05-app.webm"
at = lambda t: app_trim + t
def beat(n, key, start, end, caps=()):
    L = max(end - start, seglen(key))
    segs.append(render(n, [(V, at(start), L, 1)], aud(n, key), L, caps))
beat(5, "lend", bt["lend"], bt["borrow"], [("c-local", 1.0, 99)])
beat(6, "borrow", bt["borrow"], bt["world"], [("c-borrow", 3.0, 99)])
# world: panel → official simulator (2× speed, recorded in its own tab) → verified
p1 = pop["opened"] + 0.6 - bt["world"]
popup_len = pop["closed"] - pop["opened"]
p3 = bt["crash"] - pop["closed"]
parts = [(V, at(bt["world"]), p1, 1), (f"{C}/05-app-popup-0.webm", 0.4, popup_len / 2, 2), (V, at(pop["closed"]), p3, 1)]
L = max(p1 + popup_len / 2 + p3, seglen("world"))
segs.append(render(7, parts, aud(7, "world"), L, [("c-world", 1.0, L - 0.6)]))
beat(8, "crash", bt["crash"], bt["rescue"], [("c-crash", 1.5, 99)])
r0 = bt["rescue"]
beat(9, "rescue", r0, bt["inspect"], [("c-403", bt["denied"] - r0 - 0.4, bt["approve"] - r0 + 0.2), ("c-idp", bt["approve"] - r0 + 0.4, bt["filled"] - r0 + 0.6), ("c-rescue", bt["filled"] - r0 + 0.8, 99)])
L = seglen("inspect", 7.5); segs.append(render(10, [(V, at(bt["inspect"]), L, 1)], aud(10, "inspect"), L))
L = seglen("sepolia"); segs.append(render(11, [(f"{C}/11-sepolia.webm", trim_of("11-sepolia"), L, 1)], aud(11, "sepolia"), L, [("c-sepolia", 1.0, 11.5), ("c-anon", 13.5, L - 0.6)]))
L = seglen("trust"); segs.append(render(12, [(f"{C}/12-trust.webm", trim_of("12-trust"), L, 1)], aud(12, "trust"), L, [("c-biz", L - 7.5, L - 0.6)]))
L = seglen("close"); segs.append(render(13, [(f"{C}/13-close.webm", trim_of("13-close"), L, 1)], aud(13, "close"), L))
segs.append(render(14, [(f"{O}/end.png", 0, 4.0, 1)], None, 4.0, still=True))

with open(f"{B}/list.txt", "w") as f:
    f.writelines(f"file '{s}'\n" for s in segs)
final = os.path.join(D, "AquaPrime-demo.mp4")
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{B}/list.txt", "-c", "copy", "-movflags", "+faststart", final])
d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final], capture_output=True, text=True).stdout)
print(f"FINAL {final}  {d // 60:.0f}:{d % 60:04.1f}")
