import { describe, expect, it } from "vitest";
import { planMediaExtraction } from "../apps/chrome-extension/src/lib/media-extraction-plan.js";

describe("chrome media extraction plan", () => {
  it("routes default YouTube requests through browser captions and video mode", () => {
    expect(
      planMediaExtraction({
        url: "https://www.youtube.com/watch?v=KnUFH5GX_fI",
      }),
    ).toEqual({
      contentScriptInputMode: "video",
      directYouTubeTranscript: true,
      inputMode: "video",
      isYouTubeVideo: true,
      localTranscriptKind: "youtube",
      prefersUrlMode: true,
    });
  });

  it("honors explicit page mode without disabling later local YouTube enrichment", () => {
    expect(
      planMediaExtraction({
        url: "https://www.youtube.com/watch?v=KnUFH5GX_fI",
        requestedInputMode: "page",
      }),
    ).toEqual({
      contentScriptInputMode: "page",
      directYouTubeTranscript: false,
      inputMode: "page",
      isYouTubeVideo: true,
      localTranscriptKind: "youtube",
      prefersUrlMode: true,
    });
  });

  it("uses content-script video extraction and local media transcription for direct media", () => {
    expect(
      planMediaExtraction({
        url: "https://media.example/episode.mp3",
      }),
    ).toMatchObject({
      contentScriptInputMode: "video",
      directYouTubeTranscript: false,
      inputMode: "video",
      isYouTubeVideo: false,
      localTranscriptKind: "media",
      prefersUrlMode: true,
    });
  });

  it("keeps ordinary pages in routed page extraction unless video is explicit", () => {
    expect(
      planMediaExtraction({
        url: "https://example.com/article",
      }),
    ).toMatchObject({
      contentScriptInputMode: undefined,
      inputMode: null,
      localTranscriptKind: null,
      prefersUrlMode: false,
    });
    expect(
      planMediaExtraction({
        url: "https://example.com/article",
        requestedInputMode: "video",
      }),
    ).toMatchObject({
      contentScriptInputMode: "video",
      inputMode: "video",
      localTranscriptKind: "media",
      prefersUrlMode: false,
    });
  });

  it("does not hard-switch Loom share URLs to video/url mode by host alone", () => {
    const loomUrl = "https://www.loom.com/share/ef3224a48a084371bd6d766ee81f083f";
    expect(planMediaExtraction({ url: loomUrl })).toMatchObject({
      inputMode: null,
      prefersUrlMode: false,
      localTranscriptKind: null,
    });
    expect(
      planMediaExtraction({
        url: loomUrl,
        requestedInputMode: "video",
      }),
    ).toMatchObject({
      inputMode: "video",
      localTranscriptKind: "media",
      prefersUrlMode: false,
    });
  });
});
