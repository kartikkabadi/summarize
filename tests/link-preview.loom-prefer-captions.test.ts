import { describe, expect, it, vi } from "vitest";

const fetchTranscriptWithYtDlp = vi.hoisted(() =>
  vi.fn(async () => ({
    text: "yt-dlp should not run for caption-first Loom",
    provider: "openai",
    notes: [],
    error: null,
    segments: null,
  })),
);

vi.mock("../packages/core/src/content/transcript/providers/youtube/yt-dlp.js", () => ({
  fetchTranscriptWithYtDlp,
}));

import { fetchLinkContent } from "../packages/core/src/content/link-preview/content/index.js";

const LOOM_URL = "https://www.loom.com/share/ef3224a48a084371bd6d766ee81f083f";
const CAPTION_URL = "https://www.loom.com/captions.vtt";

const buildDeps = (fetchImpl: typeof fetch) => ({
  fetch: fetchImpl,
  scrapeWithFirecrawl: null,
  apifyApiToken: null,
  ytDlpPath: "/usr/bin/yt-dlp",
  groqApiKey: null,
  falApiKey: null,
  openaiApiKey: null,
  convertHtmlToMarkdown: null,
  transcriptCache: null,
  readTweetWithBird: null,
  resolveTwitterCookies: null,
  onProgress: null,
});

describe("link preview Loom prefer caption-first", () => {
  it("uses embedded Loom captions through the real resolver without yt-dlp", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    const loomHtml = `
      <!doctype html>
      <html>
        <body>
          <h1>Loom landing page copy</h1>
          <p>Do not return this page text.</p>
          <video>
            <track kind="captions" srclang="en" src="/captions.vtt" />
          </video>
        </body>
      </html>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const resolved =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (resolved === LOOM_URL || resolved.startsWith("https://www.loom.com/share/")) {
        return new Response(loomHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (resolved === CAPTION_URL || resolved.endsWith("/captions.vtt")) {
        return new Response(
          ["WEBVTT", "", "00:00:00.000 --> 00:00:01.000", "Caption first from Loom."].join("\n"),
          { status: 200, headers: { "content-type": "text/vtt" } },
        );
      }
      throw new Error(`unexpected fetch: ${resolved}`);
    });

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(fetchTranscriptWithYtDlp).not.toHaveBeenCalled();
    expect(result.transcriptSource).toBe("embedded");
    expect(result.content).toContain("Caption first from Loom");
    expect(result.content).not.toContain("Loom landing page copy");
    expect(result.content).not.toContain("Do not return this page text");
    expect(result.siteName).toBe("Loom");
    expect(result.isVideoOnly).toBe(true);
  });

  it("rejects Loom prefer failures with landing-page HTML present but no usable captions", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: null,
      provider: null,
      notes: ["yt-dlp transcription failed: Private video"],
      error: new Error("Private video"),
      segments: null,
    });
    const loomHtml = `
      <!doctype html>
      <html>
        <body>
          <h1>Loom landing page copy</h1>
          <p>Plausible marketing copy that must not become the extract.</p>
          <meta property="og:video" content="https://cdn.example.test/video-only.m3u8" />
        </body>
      </html>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const resolved =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (resolved === LOOM_URL || resolved.startsWith("https://www.loom.com/share/")) {
        return new Response(loomHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected fetch: ${resolved}`);
    });

    await expect(
      fetchLinkContent(
        LOOM_URL,
        { format: "text", mediaTranscript: "prefer" },
        {
          ...buildDeps(fetchMock as unknown as typeof fetch),
          openaiApiKey: "test-key",
        },
      ),
    ).rejects.toThrow(/Failed to transcribe Loom video/i);

    expect(fetchTranscriptWithYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        url: LOOM_URL,
        service: "generic",
        mediaKind: "video",
      }),
    );
    expect(fetchTranscriptWithYtDlp).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.test/video-only.m3u8" }),
    );
  });
});
