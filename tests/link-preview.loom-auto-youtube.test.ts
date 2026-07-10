import { describe, expect, it, vi } from "vitest";

const fetchTranscriptWithYtDlp = vi.hoisted(() =>
  vi.fn(async () => ({
    text: "generic loom transcript",
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
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const buildDeps = (fetchImpl: typeof fetch, extras: Record<string, unknown> = {}) => ({
  fetch: fetchImpl,
  scrapeWithFirecrawl: null,
  apifyApiToken: null,
  ytDlpPath: "/usr/bin/yt-dlp",
  groqApiKey: null,
  falApiKey: null,
  openaiApiKey: "test-key",
  convertHtmlToMarkdown: null,
  transcriptCache: null,
  readTweetWithBird: null,
  resolveTwitterCookies: null,
  onProgress: null,
  ...extras,
});

describe("link preview Loom AUTO mode YouTube substitution", () => {
  it("keeps Loom URL for yt-dlp when HTML embeds unrelated YouTube and has no captions", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "generic loom transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: null,
    });
    const set = vi.fn(async () => {});
    const get = vi.fn(async () => null);
    const loomHtml = `
      <!doctype html>
      <html>
        <body>
          <h1>Loom landing page copy</h1>
          <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
        </body>
      </html>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const resolved =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (resolved === LOOM_URL || resolved.startsWith("https://www.loom.com/share/")) {
        return new Response(loomHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (resolved.includes("youtube.com") || resolved.includes("youtu.be")) {
        throw new Error(`YouTube path must not run: ${resolved}`);
      }
      throw new Error(`unexpected fetch: ${resolved}`);
    });

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "auto" },
      buildDeps(fetchMock as unknown as typeof fetch, { transcriptCache: { get, set } }),
    );

    expect(fetchTranscriptWithYtDlp).toHaveBeenCalledTimes(1);
    expect(fetchTranscriptWithYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        url: LOOM_URL,
        service: "generic",
        mediaKind: "video",
      }),
    );
    expect(fetchTranscriptWithYtDlp).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/youtube\.com|youtu\.be/i),
      }),
    );
    expect(result.video).toEqual({ kind: "direct", url: LOOM_URL });
    expect(result.content).toContain("generic loom transcript");
    expect(result.diagnostics.embeddedVideo.used).toBe(false);
    expect(result.diagnostics.embeddedVideo.notes).toMatch(
      /Loom: embedded YouTube substitution disabled/i,
    );
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/youtube\.com|youtu\.be/i) }),
    );
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ url: YOUTUBE_URL }));
  });

  it("prefers Loom captions over unrelated YouTube iframe without yt-dlp", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    const loomHtml = `
      <!doctype html>
      <html>
        <body>
          <h1>Loom landing page copy</h1>
          <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
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
      if (resolved.includes("youtube.com") || resolved.includes("youtu.be")) {
        throw new Error(`YouTube path must not run: ${resolved}`);
      }
      throw new Error(`unexpected fetch: ${resolved}`);
    });

    const result = await fetchLinkContent(
      LOOM_URL,
      { format: "text", mediaTranscript: "auto" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(fetchTranscriptWithYtDlp).not.toHaveBeenCalled();
    expect(result.transcriptSource).toBe("embedded");
    expect(result.content).toContain("Caption first from Loom");
    expect(result.video).toEqual({ kind: "direct", url: LOOM_URL });
    expect(result.diagnostics.embeddedVideo.used).toBe(false);
  });
});
