#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
Q=quick; PAD=0.4
VF="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF4F9FE,fps=30,format=yuv420p"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
# seg <name> <clip> <speed> <audio files...>
seg() {
  local name=$1 clip=$2 speed=$3; shift 3
  local list=$Q/$name.alist; : > "$list"; for a in "$@"; do echo "file '$PWD/$a'" >> "$list"; done
  ffmpeg -v error -y -f concat -safe 0 -i "$list" -ar 48000 -ac 2 "$Q/$name.wav"
  local T; T=$(python3 -c "print($(dur $Q/$name.wav)+$PAD)")
  ffmpeg -v error -y -i "$clip" -i "$Q/$name.wav" -filter_complex "[0:v]setpts=PTS/$speed,$VF,tpad=stop_mode=clone:stop_duration=30[v];[1:a]apad[a]" \
    -map "[v]" -map "[a]" -t "$T" -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -ar 48000 "$Q/$name.mp4"
  echo "$name $(dur $Q/$name.mp4)s"
}
seg 01 clips/01-hook.webm 1 audio/00-title.aiff audio/01-hook.aiff
seg 02 clips/02-field.webm 1 audio/02-field.aiff
seg 03 clips/03-sim.webm 1 audio/03-sim.aiff
seg 04 clips/04-vm.webm 1 audio/04-vm.aiff
seg 05 clips/05-app.webm 1.33 audio/05-lend.aiff audio/06-borrow.aiff audio/07-world.aiff audio/08-crash.aiff audio/09-rescue.aiff audio/10-inspect.aiff
seg 11 clips/11-sepolia.webm 10 audio/11-sepolia.aiff
seg 12 clips/12-trust.webm 1 audio/12-trust.aiff
seg 13 clips/13-close.webm 1 audio/13-close.aiff
: > $Q/all.txt; for n in 01 02 03 04 05 11 12 13; do echo "file '$PWD/$Q/$n.mp4'" >> $Q/all.txt; done
ffmpeg -v error -y -f concat -safe 0 -i $Q/all.txt -c copy -movflags +faststart AquaPrime-demo-v1.mp4
echo "FINAL $(dur AquaPrime-demo-v1.mp4)s"
