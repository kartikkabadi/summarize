import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTranscriptForLink: vi.fn(async () => ({
    text: "Transcript text",
    source: "embedded",
    metadata: null,
    diagnostics: {
      cacheMode: "default",
      cacheStatus: "miss",
      textProvided: true,
      provider: "embedded",
      attemptedProviders: ["embedded"],
      notes: null,
    },
  })),
}));

vi.mock("../packages/core/src/content/transcript/index.js", () => ({
  resolveTranscriptForLink: mocks.resolveTranscriptForLink,
}));

import { fetchLinkContent } from "../packages/core/src/content/link-preview/content/index.js";

const buildDeps = (fetchImpl: typeof fetch) => ({
  fetch: fetchImpl,
  scrapeWithFirecrawl: null,
  apifyApiToken: null,
  ytDlpPath: null,
  groqApiKey: null,
  falApiKey: null,
  openaiApiKey: null,
  convertHtmlToMarkdown: null,
  transcriptCache: null,
  readTweetWithBird: null,
  resolveTwitterCookies: null,
  onProgress: null,
});

const LOOM_URL = "https://www.loom.com/share/ef3224a48a084371bd6d766ee81f083f";

describe("link preview media transcript preference", () => {
  it("short-circuits to transcript for direct media URLs", async () => {
    mocks.resolveTranscriptForLink.mockClear();
    const fetchMock = vi.fn(async () => {
      throw new Error("HTML fetch should not occur for direct media");
    });

    const url = "https://example.com/video.mp4";
    const result = await fetchLinkContent(
      url,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveTranscriptForLink).toHaveBeenCalled();
    expect(result.content).toContain("Transcript");
    expect(result.transcriptSource).toBe("embedded");
  });

  it("passes media transcript mode through for HTML pages", async () => {
    mocks.resolveTranscriptForLink.mockClear();
    const html = "<!doctype html><html><head><title>Ok</title></head><body>Hello</body></html>";
    const fetchMock = vi.fn(
      async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    );

    await fetchLinkContent(
      "https://example.com",
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(mocks.resolveTranscriptForLink).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ mediaTranscriptMode: "prefer" }),
    );
  });

  it("short-circuits explicit Loom transcript requests to transcript content", async () => {
    mocks.resolveTranscriptForLink.mockReset();
    mocks.resolveTranscriptForLink.mockResolvedValue({
      text: "Loom spoken transcript",
      source: "yt-dlp",
      metadata: { provider: "generic", kind: "video", transcriptionProvider: "openai" },
      diagnostics: {
        cacheMode: "default",
        cacheStatus: "miss",
        textProvided: true,
        provider: "generic",
        attemptedProviders: ["yt-dlp"],
        notes: null,
      },
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("HTML fetch should not occur for explicit Loom transcript mode");
    });

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveTranscriptForLink).toHaveBeenCalledWith(
      LOOM_URL,
      null,
      expect.any(Object),
      expect.objectContaining({ mediaTranscriptMode: "prefer" }),
    );
    expect(result.content).toContain("Loom spoken transcript");
    expect(result.content).not.toContain("Loom landing page copy");
    expect(result.transcriptSource).toBe("yt-dlp");
    expect(result.siteName).toBe("Loom");
    expect(result.isVideoOnly).toBe(true);
  });

  it("rejects explicit Loom transcript failures instead of returning page text", async () => {
    mocks.resolveTranscriptForLink.mockReset();
    mocks.resolveTranscriptForLink.mockResolvedValue({
      text: null,
      source: null,
      metadata: { provider: "generic", reason: "not_implemented" },
      diagnostics: {
        cacheMode: "default",
        cacheStatus: "miss",
        textProvided: false,
        provider: "generic",
        attemptedProviders: ["yt-dlp"],
        notes: "yt-dlp transcription failed: Private video",
      },
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("HTML fetch should not occur for explicit Loom transcript mode");
    });

    await expect(
      fetchLinkContent(
        LOOM_URL,
        { format: "text", mediaTranscript: "prefer" },
        buildDeps(fetchMock as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/Failed to transcribe Loom video.*Private video/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveTranscriptForLink).toHaveBeenCalledWith(
      LOOM_URL,
      null,
      expect.any(Object),
      expect.objectContaining({ mediaTranscriptMode: "prefer" }),
    );
  });
});
