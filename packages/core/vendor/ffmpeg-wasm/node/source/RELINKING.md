# Rebuilding and relinking the bundled WebAssembly

This directory accompanies the distributed FFmpeg and FFprobe WebAssembly executables with the machine-readable materials needed to modify the LGPL-covered LAME or FFmpeg code and relink the combined work.

## Included materials

- `build-19d425b80db2bfe2621f653de65599494aed4072.tar.gz` — complete build-source snapshot from `openclaw/ffmpeg-wasm`
- `ffmpeg-239f2c733de417201d7ad3b3b8b0d9b63285b2b1.tar.gz` — complete FFmpeg source used for the binaries
- `lame-2badea1974ae36cb8312afe99cff1e6b3b5decee.tar.gz` — complete LAME source used for the binaries
- `offline-source.patch` — the local build-source changes used to consume the bundled archives without fetching replacement source revisions
- `rebuild.sh` — prepares the exact source tree and rebuilds the combined WebAssembly
- `SHA256SUMS` — integrity hashes for the three source archives

The source archives are deterministic `git archive` exports of the exact commits recorded in `../SOURCE.json`.

## Requirements

The full build requires:

- Linux
- Emscripten `4.0.23` (`emcc`, `emconfigure`, and `emmake`)
- Node.js with Corepack and pnpm
- GNU make
- autoconf and automake
- libtool
- pkg-config
- zlib development headers
- `tar`, `gzip`, `patch`, and `sha256sum`

These are build tools and system components; they are not part of the linked WebAssembly executable.

## Verify and prepare the source tree

```sh
./rebuild.sh --prepare-only
```

This verifies all archive hashes, extracts the complete source trees, and applies the included offline-source patch. It performs no network access.

## Build a modified version

Edit the extracted LAME or FFmpeg source under the prepared work directory, then run the full build. By default:

```sh
./rebuild.sh build
```

The rebuilt files are written to `./ffmpeg-wasm-rebuilt`. Custom work and output locations may be supplied:

```sh
./rebuild.sh build /path/to/work /path/to/output
```

The script refuses to perform the matching build unless Emscripten `4.0.23` is active. The generated output contains FFmpeg, FFprobe, and the LAME/FFmpeg license files.

## License scope

FFmpeg and LAME remain licensed under their respective LGPL terms. Summarize's MIT license does not replace or narrow those terms. Recipients may modify the bundled LGPL-covered sources and use these materials to rebuild and relink the WebAssembly executables.
