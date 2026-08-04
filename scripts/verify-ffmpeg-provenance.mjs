#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vendor = resolve(root, "packages", "core", "vendor", "ffmpeg-wasm", "node");
const sourcePath = resolve(vendor, "SOURCE.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const expected = {
  buildRepository: "https://github.com/openclaw/ffmpeg-wasm",
  buildCommit: "19d425b80db2bfe2621f653de65599494aed4072",
  ffmpegRepository: "https://github.com/FFmpeg/FFmpeg",
  ffmpegRef: "n8.1.1",
  ffmpegCommit: "239f2c733de417201d7ad3b3b8b0d9b63285b2b1",
  lameRepository: "https://github.com/ffmpegwasm/lame",
  lameRefAtBuild: "master",
  lameCommit: "2badea1974ae36cb8312afe99cff1e6b3b5decee",
  emscriptenVersion: "4.0.23",
  license: "LGPL-2.1-or-later",
  rebuildCommand: "source/rebuild.sh build",
  compliancePath:
    "LGPL-2.1 Section 6(a): complete source and relinking materials bundled in source/",
  relinkingInstructions: "source/RELINKING.md",
};

for (const [key, value] of Object.entries(expected)) {
  if (source[key] !== value) {
    throw new Error(`SOURCE.json ${key} mismatch: expected ${value}, got ${source[key]}`);
  }
}

const requiredFiles = [
  "COPYING.LGPLv2.1",
  "COPYING.LGPLv3",
  "LICENSE.md",
  "COPYING.LAME",
  "LICENSE.LAME.md",
  "ffmpeg.js",
  "ffmpeg_g.wasm",
  "ffprobe.js",
  "ffprobe_g.wasm",
  "source/RELINKING.md",
  "source/PATCHES.md",
  "source/rebuild.sh",
  "source/SHA256SUMS",
  "source/offline-source.patch",
];

await Promise.all(requiredFiles.map((file) => access(resolve(vendor, file))));

const expectedArchives = {
  "build-19d425b80db2bfe2621f653de65599494aed4072.tar.gz":
    "99dd56835086c649a5b0206a6d4389fbff1f67256c98ec5e4ece771acec4ef91",
  "ffmpeg-239f2c733de417201d7ad3b3b8b0d9b63285b2b1.tar.gz":
    "9d400c3a980772df5a20d0aea32442d885b046ea295f842a44625fea0f2cb9aa",
  "lame-2badea1974ae36cb8312afe99cff1e6b3b5decee.tar.gz":
    "62371f0f4a7f2760ccc7b4c5d760d727ad6486d86ca1f9b209e2057c35d0a3c2",
};

if (JSON.stringify(source.sourceArchives) !== JSON.stringify(expectedArchives)) {
  throw new Error("SOURCE.json source archive metadata mismatch");
}

for (const [file, expectedHash] of Object.entries(expectedArchives)) {
  const bytes = await readFile(resolve(vendor, "source", file));
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${file} SHA-256 mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const corePackage = JSON.parse(
  await readFile(resolve(root, "packages", "core", "package.json"), "utf8"),
);

if (rootPackage.license !== "MIT" || corePackage.license !== "MIT") {
  throw new Error("Both npm package manifests must declare MIT");
}

for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  if (!corePackage.files?.includes(file)) {
    throw new Error(`Core npm package files must include ${file}`);
  }
}

console.log("FFmpeg/LAME provenance and package license metadata verified");
