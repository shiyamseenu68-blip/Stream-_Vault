/**
 * YouTube analyze and download routes.
 * - /analyze  : uses yt-dlp --dump-json (works reliably on servers)
 * - /download : uses yt-dlp subprocess
 */

import { Router, type Request, type Response } from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, unlink, stat, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);
const YT_DLP = process.env.YT_DLP_PATH
  || (process.platform === "win32"
    ? "C:\\Users\\shiya\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\yt-dlp.exe"
    : "yt-dlp");

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

/** Best thumbnail URL from yt-dlp JSON. */
function bestThumbnailFromYtdlp(info: Record<string, any>): string {
  const thumbs = info.thumbnails;
  if (!thumbs?.length) {
    return info.thumbnail || "";
  }
  return [...thumbs].sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
    || info.thumbnail
    || "";
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

/**
 * Run yt-dlp --dump-json to get video metadata as JSON.
 * Works reliably on servers unlike ytdl-core which gets blocked.
 */
async function ytdlpDumpJson(url: string, isPlaylist: boolean = false): Promise<Record<string, any>> {
  const cookies = process.env.YOUTUBE_COOKIES;

  // Base args - don't use player_client to avoid DRM issues
  const args = [
    "--dump-json",
    "--no-warnings",
  ];

  // Only add --no-playlist for single videos, not playlists
  if (!isPlaylist) {
    args.push("--no-playlist");
  }

  if (cookies) {
    args.push("--cookies", cookies);
  }

  args.push(url);

  try {
    const { stdout } = await execFileAsync(YT_DLP, args, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    
    // Handle specific error cases with user-friendly messages
    if (msg.includes("DRM protected") || msg.includes("This video is DRM protected")) {
      throw new Error("This video is DRM protected and cannot be downloaded");
    }
    
    if (msg.includes("Private video") || msg.includes("private video")) {
      throw new Error("This video is private and cannot be accessed");
    }
    
    if (msg.includes("unavailable") || msg.includes("removed")) {
      throw new Error("This video is unavailable or has been removed");
    }
    
    if (msg.includes("sign in") || msg.includes("not a bot") || msg.includes("Sign in")) {
      throw new Error("YouTube is blocking automated requests. Please try again later or configure YOUTUBE_COOKIES");
    }
    
    if (msg.includes("format is not available") || msg.includes("Requested format")) {
      throw new Error("The requested format is not available for this video");
    }
    
    // Generic error with original message
    throw new Error(`Failed to fetch video information: ${msg}`);
  }
}

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
      
      if (err instanceof Error) {
        const message = err.message.toLowerCase();
        
        if (message.includes("404") || message.includes("not found")) {
          res.status(404).json({
            error: "PLAYLIST_NOT_FOUND",
            message: "Playlist not found or private. Check that the playlist is public and the URL is correct."
          });
          return;
        }
        
        if (message.includes("network") || message.includes("fetch")) {
          res.status(503).json({
            error: "NETWORK_ERROR",
            message: "Failed to fetch playlist data. Please check your internet connection and try again."
          });
          return;
        }
        
        if (message.includes("parse") || message.includes("xml")) {
          res.status(500).json({
            error: "PARSE_ERROR",
            message: "Failed to parse playlist data. The playlist format may be invalid."
          });
          return;
        }
        
        // Generic error with the actual message
        res.status(500).json({
          error: "PLAYLIST_ERROR",
          message: err.message || "Failed to analyse playlist"
        });
      } else {
        res.status(500).json({
          error: "PLAYLIST_ERROR",
          message: "Failed to analyse playlist due to an unknown error"
        });
      }
      return;
    }
  }

  // ── Single video branch ────────────────────────────────────────────────────
  try {
    const info = await ytdlpDumpJson(normalised, false);

    const durationSecs = info.duration || 0;

    res.json({
      type: "video",
      videoId: info.id,
      title: info.title,
      thumbnail: bestThumbnailFromYtdlp(info),
      duration: formatDuration(durationSecs),
      durationSeconds: durationSecs,
      channel: info.uploader || info.channel || "Unknown",
      channelUrl: info.channel_url || info.uploader_url || null,
      channelAvatar: null,
      subscribers: null,
      viewCount: info.view_count || null,
      uploadDate: info.upload_date || null,
      description: info.description?.slice(0, 500) || null,
      category: info.categories?.[0] || null,
      isShort: isShortUrl(normalised),
      url: normalised,
    });
  } catch (err) {
    req.log.error({ err }, "Video analysis failed");

    const detail = err instanceof Error ? err.message : "Unknown error";
    
    // Return user-friendly error messages based on the error type
    if (detail.includes("DRM protected")) {
      res.status(403).json({
        error: "DRM_PROTECTED",
        message: detail,
      });
    } else if (detail.includes("private video")) {
      res.status(404).json({
        error: "PRIVATE_VIDEO",
        message: detail,
      });
    } else if (detail.includes("unavailable") || detail.includes("removed")) {
      res.status(404).json({
        error: "VIDEO_UNAVAILABLE",
        message: detail,
      });
    } else if (detail.includes("sign in") || detail.includes("not a bot")) {
      res.status(403).json({
        error: "BOT_DETECTED",
        message: detail,
      });
    } else {
      res.status(500).json({
        error: "ANALYSIS_FAILED",
        message: detail,
      });
    }
  }
});

// ─── yt-dlp helpers ──────────────────────────────────────────────────────────

/** Map quality string → yt-dlp -f selector (single format to avoid ffmpeg requirement). */
function ytdlpVideoFormat(quality?: string): string {
  const heightMap: Record<string, number> = {
    "1080p": 1080, "720p": 720, "480p": 480,
    "360p": 360, "240p": 240, "144p": 144,
  };
  const h = quality ? heightMap[quality] : undefined;
  if (quality === "lowest") {
    return "worst";
  }
  if (h) {
    // Use single format to avoid needing ffmpeg for merging
    return `best[height<=${h}]/best`;
  }
  return "best";
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

  req.log.info({ tmpPath }, "Download temp path");

  // yt-dlp args
  const cookies = process.env.YOUTUBE_COOKIES;
  const args: string[] = [
    "--no-playlist",
    "-o", tmpPath,
  ];

  if (cookies) {
    args.push("--cookies", cookies);
  }

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push("-f", ytdlpVideoFormat(quality));
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

  // Check if file exists at expected path
  req.log.info({ tmpPath, exists: existsSync(tmpPath) }, "File existence check after yt-dlp");
  
  // If file doesn't exist at expected path, try to find it using glob
  let actualPath = tmpPath;
  if (!existsSync(tmpPath)) {
    req.log.warn({ tmpPath }, "File not found at expected path, searching temp directory");
    // Try to find any file with the same ID
    const { readdir } = await import("fs/promises");
    const files = await readdir(tmpdir());
    const matchingFile = files.find(f => f.startsWith(`sv_${id}`));
    if (matchingFile) {
      actualPath = join(tmpdir(), matchingFile);
      req.log.info({ actualPath }, "Found file at alternative path");
    } else {
      throw new Error(`Downloaded file not found. Expected: ${tmpPath}`);
    }
  }

  // Stream the completed file to the browser
  const { size } = await statAsync(actualPath);
  const mimeType = format === "audio" ? "audio/mpeg" : "video/mp4";

  req.log.info({ actualPath, size, mimeType }, "Streaming file to response");

  // Get title from yt-dlp metadata (fast, already cached after download)
  let titleRaw = "video";
  try {
    const { stdout } = await execFileAsync(
      YT_DLP,
      ["--print", "title", "--no-playlist", "--no-warnings",
       normalised],
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

  const fileStream = createReadStream(actualPath);
  fileStream.pipe(res);

  // Clean up temp file only after response finishes successfully
  res.on("finish", () => {
    req.log.info({ actualPath }, "Download finished, cleaning up temp file");
    unlinkAsync(actualPath).catch(() => {/* ignore cleanup errors */});
  });
  
  // Clean up on client disconnect or error
  res.on("close", () => {
    fileStream.destroy();
    if (!res.writableEnded) {
      req.log.info({ actualPath }, "Response closed before finish, cleaning up temp file");
      unlinkAsync(actualPath).catch(() => {/* ignore */});
    }
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
