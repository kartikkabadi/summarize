import { describe, expect, it, vi } from "vitest";

const fetchTranscriptWithYtDlp = vi.hoisted(() =>
  vi.fn(async () => ({
    text: "yt-dlp loom transcript",
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

const LOOM_ID = "ef3224a48a084371bd6d766ee81f083f";
const LOOM_URL = `https://loom.com/share/${LOOM_ID}`;
const LOOM_WWW_URL = `https://www.loom.com/share/${LOOM_ID}`;
const OTHER_LOOM_URL = "https://www.loom.com/share/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CAPTION_URL = "https://www.loom.com/captions.vtt";

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

function htmlResponse(html: string, finalUrl: string): Response {
  const response = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(response, "url", { value: finalUrl, configurable: true });
  return response;
}

describe("link preview Loom prefer redirect-aware captions", () => {
  it("resolves relative captions against same-ID redirected finalUrl without yt-dlp", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    const loomHtml = `
      <!doctype html>
      <html>
        <body>
          <video>
            <track kind="captions" srclang="en" src="/captions.vtt" />
          </video>
        </body>
      </html>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const resolved =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (resolved === LOOM_URL || resolved.startsWith("https://loom.com/share/")) {
        return htmlResponse(loomHtml, LOOM_WWW_URL);
      }
      if (resolved === CAPTION_URL) {
        return new Response(
          ["WEBVTT", "", "00:00:00.000 --> 00:00:01.000", "Redirect-base captions."].join("\n"),
          { status: 200, headers: { "content-type": "text/vtt" } },
        );
      }
      // Wrong base (pre-redirect host without www) must not be used for captions.
      if (resolved === "https://loom.com/captions.vtt") {
        throw new Error(`caption resolved against pre-redirect URL: ${resolved}`);
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
    expect(result.content).toContain("Redirect-base captions");
    expect(result.video).toEqual({ kind: "direct", url: LOOM_URL });
  });

  it("ignores unrelated redirect HTML and falls back to yt-dlp with original Loom URL", async () => {
    fetchTranscriptWithYtDlp.mockClear();
    fetchTranscriptWithYtDlp.mockResolvedValueOnce({
      text: "yt-dlp loom transcript",
      provider: "openai",
      notes: [],
      error: null,
      segments: null,
    });
    const foreignHtml = `
      <!doctype html>
      <html>
        <body>
          <video>
            <track kind="captions" srclang="en" src="/captions.vtt" />
          </video>
        </body>
      </html>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const resolved =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (resolved === LOOM_WWW_URL || resolved.includes(LOOM_ID)) {
        return htmlResponse(foreignHtml, OTHER_LOOM_URL);
      }
      if (resolved.includes("/captions.vtt")) {
        throw new Error(`unrelated redirect captions must not be fetched: ${resolved}`);
      }
      throw new Error(`unexpected fetch: ${resolved}`);
    });

    const result = await fetchLinkContent(
      LOOM_WWW_URL,
      { format: "text", mediaTranscript: "prefer" },
      buildDeps(fetchMock as unknown as typeof fetch),
    );

    expect(fetchTranscriptWithYtDlp).toHaveBeenCalledTimes(1);
    expect(fetchTranscriptWithYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        url: LOOM_WWW_URL,
        service: "generic",
        mediaKind: "video",
      }),
    );
    expect(result.content).toContain("yt-dlp loom transcript");
    expect(result.diagnostics.transcript.notes).toMatch(/redirect changed recording/i);
  });
});
