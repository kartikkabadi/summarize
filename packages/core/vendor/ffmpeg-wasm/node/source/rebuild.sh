#!/usr/bin/env bash
set -euo pipefail

source_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mode="${1:-build}"
work_dir="${2:-${TMPDIR:-/tmp}/summarize-ffmpeg-relink}"
output_dir="${3:-${PWD}/ffmpeg-wasm-rebuilt}"

build_commit="19d425b80db2bfe2621f653de65599494aed4072"
ffmpeg_commit="239f2c733de417201d7ad3b3b8b0d9b63285b2b1"
lame_commit="2badea1974ae36cb8312afe99cff1e6b3b5decee"

case "$mode" in
  build|--prepare-only) ;;
  *)
    echo "Usage: $0 [build|--prepare-only] [work-dir] [output-dir]" >&2
    exit 2
    ;;
esac

for command_name in tar gzip patch sha256sum; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required command: $command_name" >&2
    exit 1
  }
done

(
  cd "$source_dir"
  sha256sum --check SHA256SUMS
)

rm -rf "$work_dir"
mkdir -p "$work_dir"

tar -xzf "$source_dir/build-${build_commit}.tar.gz" -C "$work_dir"
build_root="$work_dir/ffmpeg-wasm-build"
mkdir -p "$build_root/.cache"

tar -xzf "$source_dir/ffmpeg-${ffmpeg_commit}.tar.gz" -C "$build_root/.cache"
cp -a "$build_root/.cache/FFmpeg" "$build_root/.cache/FFmpeg-browser"
tar -xzf "$source_dir/lame-${lame_commit}.tar.gz" -C "$build_root/.cache"

patch -d "$build_root" -p1 < "$source_dir/offline-source.patch"

if [[ "$mode" == "--prepare-only" ]]; then
  echo "Prepared relinkable source tree at $build_root"
  exit 0
fi

for command_name in emcc emconfigure emmake corepack; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required build command: $command_name" >&2
    exit 1
  }
done

if ! emcc --version | head -n 1 | grep -Fq "4.0.23"; then
  echo "Emscripten 4.0.23 is required to match the distributed build." >&2
  emcc --version | head -n 1 >&2
  exit 1
fi

(
  cd "$build_root"
  corepack pnpm install --frozen-lockfile
  SUMMARIZE_OFFLINE_SOURCE=1 \
    FFMPEG_VERSION="$ffmpeg_commit" \
    LAME_REF="$lame_commit" \
    corepack pnpm build
)

rm -rf "$output_dir"
mkdir -p "$output_dir"
cp -a "$build_root/dist/." "$output_dir/"

echo "Rebuilt FFmpeg/FFprobe WebAssembly artifacts at $output_dir"
