import { resolveTranscriptForLink } from "../../transcript/index.js";
import { resolveTranscriptionAvailability } from "../../transcript/providers/transcription-start.js";
import type { resolveTranscriptionConfig } from "../../transcript/transcription-config.js";
import { isDirectMediaUrl, isLoomVideoUrl } from "../../url.js";
import type { LinkPreviewDeps } from "../deps.js";
import type { CacheMode } from "../types.js";
import { fetchHtmlDocument } from "./fetcher.js";
import { extractApplePodcastIds, extractSpotifyEpisodeId } from "./podcast-utils.js";
import { isTwitterBroadcastUrl } from "./twitter-utils.js";
import type { ExtractedLinkContent, MediaTranscriptMode, YoutubeTranscriptMode } from "./types.js";
import {
  appendNote,
  ensureTranscriptDiagnostics,
  finalizeExtractedLinkContent,
  selectBaseContent,
} from "./utils.js";

type TranscriptOnlyStrategy = {
  matches: (url: string, mediaTranscriptMode: MediaTranscriptMode) => boolean;
  requiresTranscriptionProvider: boolean;
  availabilityError: string | null;
  transcriptMode: (mode: MediaTranscriptMode) => MediaTranscriptMode;
  failureLabel: string;
  transcriptNote: string;
  firecrawlNote: string;
  markdownNote: string;
  siteName: string | null;
  video: (url: string) => { kind: "direct"; url: string } | null;
  isVideoOnly: boolean;
  /**
   * Fetch HTML only as optional transcript-discovery input (e.g. caption tracks).
   * Never use the HTML as article/page content for this strategy.
   */
  discoverTranscriptFromHtml?: boolean;
};

const TRANSCRIPT_ONLY_STRATEGIES: readonly TranscriptOnlyStrategy[] = [
  {
    matches: (url) => Boolean(extractSpotifyEpisodeId(url)),
    requiresTranscriptionProvider: true,
    availabilityError:
      "Spotify episode transcription requires a transcription provider (install whisper-cpp or set GROQ_API_KEY, ASSEMBLYAI_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, FAL_KEY, or DEEPGRAM_API_KEY); otherwise you may only get a captcha/recaptcha HTML page.",
    transcriptMode: (mode) => mode,
    failureLabel: "Spotify episode",
    transcriptNote: "Spotify episode: skipped HTML fetch to avoid captcha pages",
    firecrawlNote: "Spotify short-circuit skipped HTML/Firecrawl",
    markdownNote: "Spotify short-circuit uses transcript content",
    siteName: "Spotify",
    video: () => null,
    isVideoOnly: false,
  },
  {
    matches: (url) => Boolean(extractApplePodcastIds(url)),
    requiresTranscriptionProvider: true,
    availabilityError:
      "Apple Podcasts transcription requires a transcription provider (install whisper-cpp or set GROQ_API_KEY, ASSEMBLYAI_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, FAL_KEY, or DEEPGRAM_API_KEY); otherwise you may only get a slow/blocked HTML page.",
    transcriptMode: (mode) => mode,
    failureLabel: "Apple Podcasts episode",
    transcriptNote: "Apple Podcasts: skipped HTML fetch (prefer iTunes lookup / enclosures)",
    firecrawlNote: "Apple Podcasts short-circuit skipped HTML/Firecrawl",
    markdownNote: "Apple Podcasts short-circuit uses transcript content",
    siteName: "Apple Podcasts",
    video: () => null,
    isVideoOnly: false,
  },
  {
    matches: (url) => isTwitterBroadcastUrl(url),
    requiresTranscriptionProvider: false,
    availabilityError: null,
    transcriptMode: (mode) => (mode === "auto" ? "prefer" : mode),
    failureLabel: "X broadcast",
    transcriptNote: "X broadcast: skipped HTML/Firecrawl",
    firecrawlNote: "X broadcast short-circuit skipped HTML/Firecrawl",
    markdownNote: "X broadcast uses transcript content",
    siteName: "X",
    video: (url) => ({ kind: "direct", url }),
    isVideoOnly: true,
  },
  {
    matches: (url, mode) => isDirectMediaUrl(url) && mode === "prefer",
    requiresTranscriptionProvider: false,
    availabilityError: null,
    transcriptMode: (mode) => mode,
    failureLabel: "media",
    transcriptNote: "Direct media URL: skipped HTML/Firecrawl",
    firecrawlNote: "Direct media URL skipped HTML/Firecrawl",
    markdownNote: "Direct media URL uses transcript content",
    siteName: null,
    video: (url) => ({ kind: "direct", url }),
    isVideoOnly: true,
  },
  {
    // Explicit transcript requests must not fall back to Loom landing-page HTML.
    // Auto mode still uses the normal HTML path so page content remains available
    // when transcription is unavailable.
    matches: (url, mode) => isLoomVideoUrl(url) && mode === "prefer",
    requiresTranscriptionProvider: false,
    availabilityError: null,
    transcriptMode: (mode) => mode,
    failureLabel: "Loom video",
    transcriptNote: "Loom video: transcript-only (HTML used only for caption discovery)",
    firecrawlNote: "Loom video short-circuit skipped Firecrawl/page extraction",
    markdownNote: "Loom video uses transcript content",
    siteName: "Loom",
    video: (url) => ({ kind: "direct", url }),
    isVideoOnly: true,
    discoverTranscriptFromHtml: true,
  },
];

export async function tryTranscriptOnlyStrategy({
  url,
  deps,
  transcription,
  maxCharacters,
  youtubeTranscriptMode,
  mediaTranscriptMode,
  transcriptTimestamps,
  transcriptDiarization,
  transcriptVideoDownload,
  cacheMode,
  fileMtime,
  markdownRequested,
  timeoutMs,
}: {
  url: string;
  deps: LinkPreviewDeps;
  transcription: ReturnType<typeof resolveTranscriptionConfig>;
  maxCharacters: number | null;
  youtubeTranscriptMode: YoutubeTranscriptMode;
  mediaTranscriptMode: MediaTranscriptMode;
  transcriptTimestamps: boolean;
  transcriptDiarization: NonNullable<
    Parameters<typeof resolveTranscriptForLink>[3]
  >["transcriptDiarization"];
  transcriptVideoDownload: boolean;
  cacheMode: CacheMode;
  fileMtime: number | null;
  markdownRequested: boolean;
  timeoutMs: number;
}): Promise<ExtractedLinkContent | null> {
  const strategy = TRANSCRIPT_ONLY_STRATEGIES.find((candidate) =>
    candidate.matches(url, mediaTranscriptMode),
  );
  if (!strategy) return null;

  let html: string | null = null;
  let htmlDiscoveryNote: string | null = null;
  if (strategy.discoverTranscriptFromHtml) {
    try {
      const document = await fetchHtmlDocument(deps.fetch, url, {
        timeoutMs,
        onProgress: deps.onProgress ?? null,
      });
      html = document.html;
      htmlDiscoveryNote = "Loom HTML fetched for caption discovery";
    } catch {
      // HTML is optional: continue with yt-dlp using the original Loom URL.
      htmlDiscoveryNote = "Loom HTML fetch failed; continuing with yt-dlp";
    }
  }

  const transcriptResolution = await resolveTranscriptForLink(url, html, deps, {
    youtubeTranscriptMode,
    mediaTranscriptMode: strategy.transcriptMode(mediaTranscriptMode),
    transcriptTimestamps,
    transcriptDiarization,
    transcriptVideoDownload,
    cacheMode,
    fileMtime,
  });
  if (!transcriptResolution.text) {
    if (strategy.requiresTranscriptionProvider) {
      const availability = await resolveTranscriptionAvailability({ transcription });
      if (!availability.hasAnyProvider) {
        throw new Error(strategy.availabilityError ?? "Transcription provider unavailable");
      }
    }
    const notes = transcriptResolution.diagnostics?.notes;
    throw new Error(`Failed to transcribe ${strategy.failureLabel}${notes ? ` (${notes})` : ""}`);
  }

  const transcriptDiagnostics = ensureTranscriptDiagnostics(transcriptResolution, cacheMode);
  transcriptDiagnostics.notes = appendNote(transcriptDiagnostics.notes, strategy.transcriptNote);
  if (htmlDiscoveryNote) {
    transcriptDiagnostics.notes = appendNote(transcriptDiagnostics.notes, htmlDiscoveryNote);
  }

  return finalizeExtractedLinkContent({
    url,
    // Never surface article/landing-page HTML from this path.
    baseContent: selectBaseContent("", transcriptResolution.text, transcriptResolution.segments),
    maxCharacters,
    title: null,
    description: null,
    siteName: strategy.siteName,
    transcriptResolution,
    video: strategy.video(url),
    isVideoOnly: strategy.isVideoOnly,
    diagnostics: {
      strategy: "html",
      firecrawl: {
        attempted: false,
        used: false,
        cacheMode,
        cacheStatus: cacheMode === "bypass" ? "bypassed" : "unknown",
        notes: strategy.firecrawlNote,
      },
      markdown: {
        requested: markdownRequested,
        used: false,
        provider: null,
        notes: strategy.markdownNote,
      },
      transcript: transcriptDiagnostics,
    },
  });
}
