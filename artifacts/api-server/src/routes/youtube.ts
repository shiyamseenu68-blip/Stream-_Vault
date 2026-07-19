/**
 * YouTube analyze and download routes.
 * Uses @distube/ytdl-core for metadata and streaming,
 * fluent-ffmpeg for MP3 audio conversion (ffmpeg is pre-installed).
 */

import { Router, type Request, type Response } from "express";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validate and normalise a YouTube URL string. Returns null if invalid. */
function normaliseYouTubeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("?")[0];
    if (!id) return null;
    return raw.trim();
  }

  // youtube.com paths
  const path = url.pathname;
  if (
    path.startsWith("/watch") ||
    path.startsWith("/shorts/") ||
    path.startsWith("/embed/") ||
    path.startsWith("/v/") ||
    url.searchParams.has("list") // playlist
  ) {
    return raw.trim();
  }

  return null;
}

/** Detect whether a URL refers to a playlist. */
function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("list");
  } catch {
    return false;
  }
}

/** Detect whether a URL refers to a YouTube Short. */
function isShortUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

/** Format seconds → "1:23:45" or "3:45". */
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format a view count → "1.2M", "345K", etc. */
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Best thumbnail URL from ytdl info. */
function bestThumbnail(info: ytdl.videoInfo): string {
  const thumbs = info.videoDetails.thumbnails;
  if (!thumbs?.length) return "";
  // sort by width descending, take best
  return [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url;
}

/** Map quality string to ytdl quality filter. */
function mapQuality(quality?: string): string {
  switch (quality) {
    case "1080p": return "1080";
    case "720p":  return "720";
    case "480p":  return "480";
    case "360p":  return "360";
    case "240p":  return "240";
    case "144p":  return "144";
    case "lowest": return "lowest";
    default:      return "highest";
  }
}

/** Sanitise a filename by removing characters that cause issues. */
function safeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200);
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

router.post("/analyze", async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "INVALID_REQUEST", message: "URL is required" });
    return;
  }

  const normalised = normaliseYouTubeUrl(url);
  if (!normalised) {
    res.status(400).json({
      error: "INVALID_URL",
      message: "Please enter a valid YouTube URL (youtube.com or youtu.be)",
    });
    return;
  }

  req.log.info({ url: normalised }, "Analysing URL");

  // ── Playlist branch ────────────────────────────────────────────────────────
  if (isPlaylistUrl(normalised)) {
    try {
      const parsed = new URL(normalised);
      const listId = parsed.searchParams.get("list")!;

      // ytdl can't enumerate playlists — use YouTube's oEmbed + page scraping
      // approach via the public playlist page to grab basic metadata, then
      // for each video in the playlist we rely on the per-video API.
      // Since ytdl-core doesn't expose a playlist enumeration API, we use
      // the undocumented YouTube internal endpoint.
      const playlistApiUrl =
        `https://www.youtube.com/playlist?list=${listId}`;

      // Fetch playlist page and parse initial data
      const pageRes = await fetch(playlistApiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!pageRes.ok) {
        throw new Error(`Failed to fetch playlist page: ${pageRes.status}`);
      }

      const html = await pageRes.text();

      // Extract ytInitialData from page
      const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
      if (!match) {
        throw new Error("Could not parse playlist data from YouTube");
      }

      const data = JSON.parse(match[1]);

      // Navigate the deeply nested structure
      const header =
        data?.header?.playlistHeaderRenderer ??
        data?.header?.gridVideoRenderer;

      const sidebar =
        data?.sidebar?.playlistSidebarRenderer?.items?.[0]
          ?.playlistSidebarPrimaryInfoRenderer;

      const titleRuns =
        sidebar?.title?.runs?.[0]?.text ??
        header?.title?.runs?.[0]?.text ??
        "Unknown Playlist";

      const ownerRuns =
        sidebar?.videoOwner?.videoOwnerRenderer?.title?.runs?.[0]?.text ??
        data?.sidebar?.playlistSidebarRenderer?.items?.[1]
          ?.playlistSidebarSecondaryInfoRenderer
          ?.videoOwner?.videoOwnerRenderer?.title?.runs?.[0]?.text ??
        null;

      // Extract videos from the playlist content
      const contents =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
          ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
          ?.itemSectionRenderer?.contents?.[0]
          ?.playlistVideoListRenderer?.contents ?? [];

      interface PlaylistVideoRenderer {
        playlistVideoRenderer?: {
          videoId?: string;
          title?: { runs?: Array<{ text: string }> };
          thumbnail?: { thumbnails?: Array<{ url: string; width?: number }> };
          lengthSeconds?: string;
          shortBylineText?: { runs?: Array<{ text: string }> };
        };
      }

      const videos = (contents as PlaylistVideoRenderer[])
        .filter((c) => c.playlistVideoRenderer?.videoId)
        .map((c) => {
          const v = c.playlistVideoRenderer!;
          const vId = v.videoId!;
          const titleText = v.title?.runs?.[0]?.text ?? "Unknown";
          const thumb =
            v.thumbnail?.thumbnails?.sort(
              (a, b) => (b.width ?? 0) - (a.width ?? 0),
            )?.[0]?.url ?? `https://img.youtube.com/vi/${vId}/hqdefault.jpg`;
          const secs = parseInt(v.lengthSeconds ?? "0", 10);
          const channel = v.shortBylineText?.runs?.[0]?.text ?? null;

          return {
            videoId: vId,
            title: titleText,
            thumbnail: thumb,
            duration: formatDuration(secs),
            durationSeconds: secs,
            channel,
            url: `https://www.youtube.com/watch?v=${vId}`,
          };
        });

      const totalSecs = videos.reduce((s, v) => s + v.durationSeconds, 0);

      // Try to get playlist thumbnail from first video
      const thumbnail =
        videos[0]?.thumbnail ??
        `https://img.youtube.com/vi/${videos[0]?.videoId ?? "default"}/hqdefault.jpg`;

      res.json({
        type: "playlist",
        playlistId: listId,
        title: titleRuns,
        thumbnail,
        videoCount: videos.length,
        totalDuration: formatDuration(totalSecs),
        totalDurationSeconds: totalSecs,
        creator: ownerRuns,
        url: normalised,
        videos,
      });
      return;
    } catch (err) {
      req.log.error({ err }, "Playlist analysis failed");
      const message =
        err instanceof Error ? err.message : "Failed to analyse playlist";
      res.status(500).json({ error: "PLAYLIST_ERROR", message });
      return;
    }
  }

  // ── Single video branch ────────────────────────────────────────────────────
  try {
    const info = await ytdl.getInfo(normalised);
    const details = info.videoDetails;

    const durationSecs = parseInt(details.lengthSeconds, 10);

    res.json({
      type: "video",
      videoId: details.videoId,
      title: details.title,
      thumbnail: bestThumbnail(info),
      duration: formatDuration(durationSecs),
      durationSeconds: durationSecs,
      channel: details.author?.name ?? "Unknown",
      channelUrl: details.author?.channel_url ?? null,
      channelAvatar: details.author?.thumbnails?.[0]?.url ?? null,
      subscribers: details.author?.subscriber_count
        ? formatViews(details.author.subscriber_count)
        : null,
      viewCount: details.viewCount ? parseInt(details.viewCount, 10) : null,
      uploadDate: details.publishDate ?? null,
      description: details.description?.slice(0, 500) ?? null,
      category: details.category ?? null,
      isShort: isShortUrl(normalised),
      url: normalised,
    });
  } catch (err) {
    req.log.error({ err }, "Video analysis failed");

    const errMsg =
      err instanceof Error ? err.message.toLowerCase() : "";

    if (errMsg.includes("private video")) {
      res.status(404).json({
        error: "PRIVATE_VIDEO",
        message: "This video is private and cannot be accessed",
      });
    } else if (errMsg.includes("unavailable") || errMsg.includes("removed")) {
      res.status(404).json({
        error: "VIDEO_UNAVAILABLE",
        message: "This video is unavailable or has been removed",
      });
    } else if (errMsg.includes("age")) {
      res.status(403).json({
        error: "AGE_RESTRICTED",
        message: "This video is age-restricted",
      });
    } else if (errMsg.includes("copyright")) {
      res.status(403).json({
        error: "COPYRIGHT",
        message: "This video is blocked due to copyright restrictions",
      });
    } else {
      res.status(500).json({
        error: "ANALYSIS_FAILED",
        message: "Failed to analyse this video. It may be unavailable in your region.",
      });
    }
  }
});

// ─── Download ─────────────────────────────────────────────────────────────────

router.get("/download", async (req: Request, res: Response) => {
  const { url, format, quality } = req.query as {
    url?: string;
    format?: string;
    quality?: string;
  };

  if (!url || !format) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "url and format are required" });
    return;
  }

  const normalised = normaliseYouTubeUrl(url);
  if (!normalised) {
    res.status(400).json({ error: "INVALID_URL", message: "Invalid YouTube URL" });
    return;
  }

  if (format !== "video" && format !== "audio") {
    res.status(400).json({ error: "INVALID_FORMAT", message: "format must be video or audio" });
    return;
  }

  req.log.info({ url: normalised, format, quality }, "Download requested");

  try {
    const info = await ytdl.getInfo(normalised);
    const title = safeFilename(info.videoDetails.title);

    if (format === "audio") {
      // ── Audio (MP3 via ffmpeg) ───────────────────────────────────────────
      res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const audioStream = ytdl(normalised, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25, // 32 MB buffer
      });

      const passThrough = new PassThrough();

      const proc = ffmpeg(audioStream)
        .audioBitrate(192)
        .format("mp3")
        .on("error", (err) => {
          req.log.error({ err }, "ffmpeg audio conversion error");
          if (!res.headersSent) {
            res.status(500).json({ error: "CONVERSION_ERROR", message: "Audio conversion failed" });
          } else {
            passThrough.destroy(err);
          }
        });

      proc.pipe(passThrough);
      passThrough.pipe(res);

      req.on("close", () => {
        audioStream.destroy();
        proc.kill("SIGKILL");
      });
    } else {
      // ── Video (MP4) ──────────────────────────────────────────────────────
      res.setHeader("Content-Disposition", `attachment; filename="${title}.mp4"`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const qualStr = mapQuality(quality);

      // Try to get a single combined mp4 stream first (simpler, no ffmpeg mux needed)
      const formats = ytdl.filterFormats(info.formats, "videoandaudio");
      let videoStream: ReturnType<typeof ytdl>;

      if (formats.length > 0) {
        // We have combined streams — pick by quality label
        const qualityLabel = quality && quality !== "highest" && quality !== "lowest"
          ? quality
          : undefined;

        const chosen = qualityLabel
          ? (formats.find((f) => f.qualityLabel === qualityLabel) ?? formats[0])
          : qualStr === "lowest"
            ? formats[formats.length - 1]
            : formats[0];

        videoStream = ytdl(normalised, { format: chosen });
      } else {
        // No combined streams (common for 1080p+) — download video+audio and mux
        const videoOnly = ytdl(normalised, {
          quality: qualStr === "highest" || qualStr === "lowest" ? qualStr : "highestvideo",
          filter: "videoonly",
          highWaterMark: 1 << 25,
        });
        const audioOnly = ytdl(normalised, {
          filter: "audioonly",
          quality: "highestaudio",
          highWaterMark: 1 << 25,
        });

        const passThrough = new PassThrough();

        const proc = ffmpeg()
          .input(videoOnly)
          .input(audioOnly)
          .outputOptions(["-c:v copy", "-c:a aac", "-movflags frag_keyframe+empty_moov"])
          .format("mp4")
          .on("error", (err) => {
            req.log.error({ err }, "ffmpeg mux error");
            if (!res.headersSent) {
              res.status(500).json({ error: "MUX_ERROR", message: "Video processing failed" });
            } else {
              passThrough.destroy(err);
            }
          });

        proc.pipe(passThrough);
        passThrough.pipe(res);

        req.on("close", () => {
          videoOnly.destroy();
          audioOnly.destroy();
          proc.kill("SIGKILL");
        });
        return;
      }

      videoStream.pipe(res);

      req.on("close", () => {
        videoStream.destroy();
      });
    }
  } catch (err) {
    req.log.error({ err }, "Download failed");
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "Download failed";
      res.status(500).json({ error: "DOWNLOAD_FAILED", message });
    }
  }
});

// ─── Playlist item download ────────────────────────────────────────────────

router.post("/download/playlist", async (req: Request, res: Response) => {
  const { url, format, quality } = req.body as {
    url?: string;
    format?: string;
    quality?: string;
  };

  // Delegate to the same logic as single download by forwarding as query params
  // We do this by constructing a fake query and re-using the handler logic
  if (!url || !format) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "url and format are required" });
    return;
  }

  // Redirect to GET /download with the same params so the streaming logic is reused
  const qs = new URLSearchParams({ url, format, ...(quality ? { quality } : {}) });
  res.redirect(`/api/download?${qs.toString()}`);
});

export default router;
