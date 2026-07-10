import { describe, expect, it, vi } from "vitest";
import { ensureChatExtract } from "../apps/chrome-extension/src/entrypoints/background/extract-cache.js";

const LOOM_URL = "https://www.loom.com/share/ef3224a48a084371bd6d766ee81f083f";

describe("chrome extract-cache Loom chat routing", () => {
  it("caches readable Loom page extraction instead of guarded daemon URL-only landing pages", async () => {
    const setCachedExtract = vi.fn();
    const panelSessionStore = {
      getCachedExtract: vi.fn(() => null),
      setCachedExtract,
      getLastMediaProbe: vi.fn(() => null),
      rememberMediaProbe: vi.fn(),
    };
    const extractFromTab = vi.fn(async () => ({
      ok: true as const,
      data: {
        ok: true as const,
        url: LOOM_URL,
        title: "Loom recording",
        text: "Visible Loom page text from the extension for chat context. ".repeat(4),
        truncated: false,
        media: { hasVideo: true, hasAudio: true, hasCaptions: false },
      },
    }));
    const daemonFetchImpl = vi.fn(async () => {
      throw new Error("daemon URL-only extract must not run for readable Loom pages");
    });
    const sendStatus = vi.fn();

    const result = await ensureChatExtract({
      session: { windowId: 1 },
      tab: { id: 7, url: LOOM_URL, title: "Loom recording" } as chrome.tabs.Tab,
      settings: {
        extendedLogging: false,
        maxChars: 10_000,
        slideRuntime: "daemon",
        slidesEnabled: false,
        token: "token",
        daemonPort: "8787",
      },
      panelSessionStore,
      sendStatus,
      extractFromTab,
      fetchImpl: daemonFetchImpl as unknown as typeof fetch,
      daemonFetchImpl: daemonFetchImpl as unknown as typeof fetch,
    });

    expect(daemonFetchImpl).not.toHaveBeenCalled();
    expect(extractFromTab).toHaveBeenCalled();
    expect(result.source).toBe("page");
    expect(result.text).toContain("Visible Loom page text from the extension");
    expect(setCachedExtract).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        source: "page",
        text: expect.stringContaining("Visible Loom page text from the extension"),
      }),
    );
  });
});
