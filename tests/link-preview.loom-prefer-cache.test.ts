import { describe, expect, it, vi } from "vitest";

const fetchTranscriptWithYtDlp = vi.hoisted(() =>
  vi.fn(async () => ({
    text: "fresh yt-dlp transcript",
    provider: "openai",
    notes: [],
    error: null,
    segments: null,
  })),
);

vi.mock("../packages/core/src/content/transcript/providers/youtube/yt-dlp.js", () => ({
  fetchTranscriptWithYtDlp,
}));

import type { TranscriptCache } from "../packages/core/src/content/cache/types.js";
import { fetchLinkContent } from "../packages/core/src/content/link-preview/content/index.js";

const LOOM_URL = "https://www.loom.com/share/ef3224a48a084371bd6d766ee81f083f";

const buildDeps = (fetchImpl: typeof fetch, transcriptCache: TranscriptCache | null) => ({
  fetch: fetchImpl,
  scrapeWithFirecrawl: null,
  apifyApiToken: null,
  ytDlpPath: "/usr/bin/yt-dlp",
  groqApiKey: null,
  falApiKey: null,
  openaiApiKey: "test-key",
  convertHtmlToMarkdown: null,
  transcriptCache,
  readTweetWithBird: null,
  resolveTwitterCookies: null,
  onProgress: null,
});

describe("link preview Loom prefer cache-before-HTML", () => {
  it("returns warm cache without HTML fetch", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    const get = vi.fn(async () => ({
      content: "cached loom transcript",
      source: "yt-dlp",
      expired: false,
      metadata: { provider: "generic", kind: "video" },
    }));
    const set = vi.fn(async () => {});
    const fetchMock = vi.fn(async () => {
      throw new Error("HTML fetch must not run on warm cache");
    });

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch, { get, set }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fetchTranscriptWithYtDlp).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
    expect(result.content).toContain("cached loom transcript");
    expect(result.siteName).toBe("Loom");
    expect(result.video).toEqual({ kind: "direct", url: LOOM_URL });
  });

  it("fetches HTML when cacheMode is bypass", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "fresh yt-dlp transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: null,
    });
    const get = vi.fn(async () => ({
      content: "cached loom transcript",
      source: "yt-dlp",
      expired: false,
      metadata: { provider: "generic" },
    }));
    const set = vi.fn(async () => {});
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body>Loom</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer", cacheMode: "bypass" },
      buildDeps(fetchMock as unknown as typeof fetch, { get, set }),
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchTranscriptWithYtDlp).toHaveBeenCalled();
    expect(result.content).toContain("fresh yt-dlp transcript");
  });

  it("fetches HTML when cached transcript is expired", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "fresh yt-dlp transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: null,
    });
    const get = vi.fn(async () => ({
      content: "expired loom transcript",
      source: "yt-dlp",
      expired: true,
      metadata: { provider: "generic" },
    }));
    const set = vi.fn(async () => {});
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body>Loom</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch, { get, set }),
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(result.content).toContain("fresh yt-dlp transcript");
  });

  it("fetches HTML when cached transcript lacks requested timestamps", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "fresh yt-dlp transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: [{ startMs: 0, endMs: 1000, text: "fresh" }],
    });
    const get = vi.fn(async () => ({
      content: "cached without segments",
      source: "yt-dlp",
      expired: false,
      metadata: { timestamps: true },
    }));
    const set = vi.fn(async () => {});
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body>Loom</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer", transcriptTimestamps: true },
      buildDeps(fetchMock as unknown as typeof fetch, { get, set }),
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(result.content).toContain("fresh");
  });

  it("fetches HTML when cached transcript lacks requested diarization", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "fresh yt-dlp transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: null,
    });
    const get = vi.fn(async () => ({
      content: "cached without speakers",
      source: "yt-dlp",
      expired: false,
      metadata: { provider: "generic" },
    }));
    const set = vi.fn(async () => {});
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body>Loom</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer", transcriptDiarization: "openai" },
      buildDeps(fetchMock as unknown as typeof fetch, { get, set }),
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(result.content).toContain("fresh yt-dlp transcript");
  });
});
