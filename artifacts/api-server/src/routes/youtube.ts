/**
 * YouTube analyze and download routes.
 * - /analyze  : uses @distube/ytdl-core (metadata only — still works fine)
 * - /download : uses yt-dlp subprocess (replaces broken ytdl-core stream URLs)
 */

import { Router, type Request, type Response } from "express";
import ytdl from "@distube/ytdl-core";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, unlink, stat } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);
const YT_DLP = "yt-dlp";

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

/**
 * Recursively walk an object up to `maxDepth` levels deep looking for the
 * first occurrence of a key named `targetKey`. Returns the value or null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepFind(obj: any, targetKey: string, maxDepth: number): any {
  if (!obj || typeof obj !== "object" || maxDepth <= 0) return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) return obj[targetKey];
  for (const val of Object.values(obj)) {
    const found = deepFind(val, targetKey, maxDepth - 1);
    if (found !== null) return found;
  }
  return null;
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

      // YouTube's public RSS feed — reliable, no bot-detection, no auth needed.
      // Returns up to ~100 videos; no duration data available via RSS.
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`;
      const rssRes = await fetch(rssUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StreamVault/1.0)",
          "Accept": "application/xml,text/xml,*/*",
        },
      });

      if (!rssRes.ok) {
        throw new Error(
          `Playlist not found or private (RSS status ${rssRes.status}). ` +
          `Check that the playlist is public and the URL is correct.`
        );
      }

      const xml = await rssRes.text();

      // ── Parse XML without a DOM parser (no dependency needed) ─────────────
      const tagText = (tag: string, src = xml): string => {
        const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].trim() : "";
      };
      const attr = (attrName: string, src: string): string => {
        const m = src.match(new RegExp(`${attrName}="([^"]*)"`));
        return m ? m[1] : "";
      };

      // Top-level feed metadata
      // <title> appears twice: feed title first, then inside each entry — take first
      const feedTitle = xml.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? "Unknown Playlist";
      const feedAuthor = tagText("name", xml.match(/<author>([\s\S]*?)<\/author>/)?.[0] ?? "") || null;

      // Extract every <entry> block
      const entryMatches = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

      const videos = entryMatches.map((m) => {
        const entry = m[1];
        const videoId = tagText("yt:videoId", entry);
        const title = tagText("title", entry).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        const link = attr("href", entry.match(/<link [^>]*rel="alternate"[^>]*>/)?.[0] ?? "");
        // Best thumbnail: media:thumbnail url attribute
        const thumbMatch = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/);
        const thumbnail = thumbMatch?.[1] ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const channel = tagText("name", entry.match(/<author>([\s\S]*?)<\/author>/)?.[0] ?? "") || null;
        const views = parseInt(entry.match(/statistics views="(\d+)"/)?.[1] ?? "0", 10);

        return {
          videoId,
          title,
          thumbnail,
          duration: "0:00",          // RSS doesn't include duration
          durationSeconds: 0,
          channel,
          views: views > 0 ? formatViews(views) : null,
          url: link || `https://www.youtube.com/watch?v=${videoId}&list=${listId}`,
        };
      }).filter((v) => v.videoId);

      req.log.info({ count: videos.length, listId }, "Playlist RSS parsed");

      const thumbnail =
        videos[0]?.thumbnail ??
        `https://img.youtube.com/vi/default/hqdefault.jpg`;

      res.json({
        type: "playlist",
        playlistId: listId,
        title: feedTitle,
        thumbnail,
        videoCount: videos.length,
        totalDuration: "N/A",
        totalDurationSeconds: 0,
        creator: feedAuthor,
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

// ─── yt-dlp helpers ──────────────────────────────────────────────────────────

/** Map quality string → yt-dlp -f selector (HLS-compatible, no ext=mp4 filter). */
function ytdlpVideoFormat(quality?: string): string {
  const heightMap: Record<string, number> = {
    "1080p": 1080, "720p": 720, "480p": 480,
    "360p": 360, "240p": 240, "144p": 144,
  };
  const h = quality ? heightMap[quality] : undefined;
  if (quality === "lowest") {
    return "worstvideo+worstaudio/worst";
  }
  if (h) {
    return `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
  }
  return "bestvideo+bestaudio/best";
}

/**
 * Download a YouTube URL to a temp file using yt-dlp, then stream the file
 * to the response. Using a temp file (vs stdout pipe) avoids HLS merge issues
 * and lets us set Content-Length for a proper browser progress bar.
 *
 * @param normalised  Validated YouTube URL
 * @param format      "video" | "audio"
 * @param quality     e.g. "720p" | "highest"
 * @param req         Express request (for logging + close detection)
 * @param res         Express response
 */
async function downloadViaTempFile(
  normalised: string,
  format: string,
  quality: string | undefined,
  req: Request,
  res: Response,
): Promise<void> {
  const id = randomBytes(8).toString("hex");
  const ext = format === "audio" ? "mp3" : "mp4";
  const tmpPath = join(tmpdir(), `sv_${id}.${ext}`);

  // yt-dlp args
  const args: string[] = [
    "--extractor-args", "youtube:player_client=ios",
    "--no-playlist",
    "-o", tmpPath,
  ];

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push(
      "-f", ytdlpVideoFormat(quality),
      "--merge-output-format", "mp4",
    );
  }

  args.push(normalised);

  req.log.info({ args: args.join(" ") }, "Launching yt-dlp");

  // Run yt-dlp to completion (downloads HLS segments + merges)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(YT_DLP, args, { stdio: ["ignore", "pipe", "pipe"] });

    const stderrLines: string[] = [];
    proc.stderr!.on("data", (d: Buffer) => {
      const line = d.toString().trimEnd();
      stderrLines.push(line);
      req.log.debug({ msg: line }, "yt-dlp");
    });

    // Abort if client disconnects
    const onClose = () => { if (!proc.killed) proc.kill("SIGTERM"); };
    req.on("close", onClose);

    proc.on("error", (err) => {
      req.off("close", onClose);
      reject(err);
    });

    proc.on("close", (code) => {
      req.off("close", onClose);
      if (code === 0) {
        resolve();
      } else {
        const lastErr = stderrLines.slice(-3).join(" | ");
        reject(new Error(`yt-dlp exited ${code}: ${lastErr}`));
      }
    });
  });

  // Stream the completed file to the browser
  const { size } = await statAsync(tmpPath);
  const mimeType = format === "audio" ? "audio/mpeg" : "video/mp4";

  // Get title from yt-dlp metadata (fast, already cached after download)
  let titleRaw = "video";
  try {
    const { stdout } = await execFileAsync(
      YT_DLP,
      ["--print", "title", "--no-playlist", "--no-warnings",
       "--extractor-args", "youtube:player_client=ios", normalised],
      { timeout: 10_000 },
    );
    titleRaw = stdout.trim() || "video";
  } catch { /* keep default */ }

  const safeTitle = safeFilename(titleRaw);

  res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(size));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  const fileStream = createReadStream(tmpPath);
  fileStream.pipe(res);

  // Clean up temp file once the response is done
  res.on("finish", () => {
    unlinkAsync(tmpPath).catch(() => {/* ignore cleanup errors */});
  });
  res.on("close", () => {
    fileStream.destroy();
    unlinkAsync(tmpPath).catch(() => {/* ignore */});
  });
}

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
    await downloadViaTempFile(normalised, format, quality, req, res);
    req.log.info({ format }, "Download completed successfully");
  } catch (err) {
    req.log.error({ err }, "Download failed");
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "Download failed";
      res.status(500).json({ error: "DOWNLOAD_FAILED", message });
    }
  }
});

// ─── Playlist item download (redirect to GET /download) ───────────────────────

router.post("/download/playlist", (req: Request, res: Response) => {
  const { url, format, quality } = req.body as {
    url?: string;
    format?: string;
    quality?: string;
  };
  if (!url || !format) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "url and format are required" });
    return;
  }
  const qs = new URLSearchParams({ url, format, ...(quality ? { quality } : {}) });
  res.redirect(`/api/download?${qs.toString()}`);
});

export default router;
