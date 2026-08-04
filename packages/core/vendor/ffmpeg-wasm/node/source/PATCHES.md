# Local build-source patch

The complete build-source snapshot is preserved unchanged in `build-19d425b80db2bfe2621f653de65599494aed4072.tar.gz`.

Before rebuilding, `rebuild.sh` applies `offline-source.patch` to `scripts/build.ts`. The patch makes two narrow changes:

1. When `SUMMARIZE_OFFLINE_SOURCE=1`, use the exact FFmpeg and LAME source trees extracted from this directory instead of fetching mutable remote refs.
2. Copy LAME's `COPYING` and `LICENSE` files into the rebuilt distribution beside the WebAssembly artifacts.

No FFmpeg or LAME source file is modified by this patch.
