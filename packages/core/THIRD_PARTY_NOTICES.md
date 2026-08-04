# Third-Party Notices

`@steipete/summarize-core` includes prebuilt FFmpeg and FFprobe WebAssembly artifacts under `dist/ffmpeg-wasm/node/`.

The surrounding Summarize source code is licensed under the MIT License. The bundled FFmpeg, FFprobe, and LAME code remains governed by its own license terms and is not relicensed under MIT.

## FFmpeg and FFprobe WebAssembly

- License: GNU Lesser General Public License v2.1 or later (`LGPL-2.1-or-later`)
- FFmpeg source: <https://github.com/FFmpeg/FFmpeg/tree/239f2c733de417201d7ad3b3b8b0d9b63285b2b1>
- FFmpeg release ref: `n8.1.1`
- Build source and scripts: <https://github.com/openclaw/ffmpeg-wasm/tree/19d425b80db2bfe2621f653de65599494aed4072>
- Build toolchain: Emscripten `4.0.23`

The FFmpeg license notice and LGPL texts are distributed beside the WebAssembly files:

- `dist/ffmpeg-wasm/node/LICENSE.md`
- `dist/ffmpeg-wasm/node/COPYING.LGPLv2.1`
- `dist/ffmpeg-wasm/node/COPYING.LGPLv3`

## LAME

The WebAssembly build statically includes LAME for MP3 encoding.

- License: GNU Lesser General Public License
- Source: <https://github.com/ffmpegwasm/lame/tree/2badea1974ae36cb8312afe99cff1e6b3b5decee>
- Historical build ref: `master`
- Exact commit used by that ref throughout the build window: `2badea1974ae36cb8312afe99cff1e6b3b5decee`
- Project site: <https://lame.sourceforge.io/>

LAME's license and acknowledgement notice are distributed beside the WebAssembly files:

- `dist/ffmpeg-wasm/node/COPYING.LAME`
- `dist/ffmpeg-wasm/node/LICENSE.LAME.md`

## Rebuilding

The exact source revisions and rebuild command are recorded in:

- `dist/ffmpeg-wasm/node/SOURCE.json`

From the build-source checkout at commit `19d425b80db2bfe2621f653de65599494aed4072`, the corresponding artifacts can be rebuilt with:

```sh
FFMPEG_VERSION=239f2c733de417201d7ad3b3b8b0d9b63285b2b1 \
LAME_REF=2badea1974ae36cb8312afe99cff1e6b3b5decee \
pnpm build
```

The build repository documents the required system packages and uses the build script at `scripts/build.ts`.

## Relinking materials

The WebAssembly executables statically include LGPL-covered LAME code. To support modification and relinking under LGPL-2.1 Section 6(a), the npm package distributes the complete machine-readable source used for FFmpeg and LAME, the complete build-source snapshot, the local build patch, integrity hashes, and an offline preparation/rebuild script at:

- `dist/ffmpeg-wasm/node/source/RELINKING.md`
- `dist/ffmpeg-wasm/node/source/rebuild.sh`
- `dist/ffmpeg-wasm/node/source/SHA256SUMS`
- `dist/ffmpeg-wasm/node/source/offline-source.patch`
- `dist/ffmpeg-wasm/node/source/build-19d425b80db2bfe2621f653de65599494aed4072.tar.gz`
- `dist/ffmpeg-wasm/node/source/ffmpeg-239f2c733de417201d7ad3b3b8b0d9b63285b2b1.tar.gz`
- `dist/ffmpeg-wasm/node/source/lame-2badea1974ae36cb8312afe99cff1e6b3b5decee.tar.gz`

These materials allow a recipient to modify LAME or FFmpeg and rebuild the combined WebAssembly with Emscripten 4.0.23. They are shipped inside the same npm artifact as the executable WebAssembly rather than being available only through external links.
