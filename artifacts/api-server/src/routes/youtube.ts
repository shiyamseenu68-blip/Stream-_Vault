/**
 * YouTube analyze and download routes.
 * - /analyze  : uses yt-dlp --dump-json (works reliably on servers)
 * - /download : uses yt-dlp subprocess
 */

import { Router, type Request, type Response } from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, unlink, stat, existsSync, writeFile } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);
const writeFileAsync = promisify(writeFile);
const YT_DLP = process.env.YT_DLP_PATH
  || (process.platform === "win32"
    ? "C:\\Users\\shiya\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\yt-dlp.exe"
    : "yt-dlp");

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validate YouTube cookies format and check for required authentication cookies */
function validateYoutubeCookies(cookiesContent: string): { 
  valid: boolean; 
  missing: string[]; 
  hasRequired: boolean;
  cookieNames: string[];
  domains: string[];
  isNetscapeFormat: boolean;
  hasSapisid: boolean;
  hasSecure3Papisid: boolean;
  hasSecure1Papisid: boolean;
  sapisidDomains: string[];
  secure3papisidDomains: string[];
  secure1papisidDomains: string[];
  totalLines: number;
  parsedLines: number;
  cookieNameDomainMap: Array<{name: string, domain: string}>;
} {
  // According to latest yt-dlp (commit 75079f4), only these are required:
  // SAPISID OR __Secure-3PAPISID (at least one must exist)
  // __Secure-3PAPISID is the main authentication cookie
  // __Secure-1PAPISID is optional but recommended
  // HSID, SID, SSID, APISID are no longer required
  const allCookieNames: string[] = [];
  const domains: Set<string> = new Set();
  let hasSapisid = false;
  let hasSecure3Papisid = false;
  let hasSecure1Papisid = false;
  const sapisidDomains: string[] = [];
  const secure3papisidDomains: string[] = [];
  const secure1papisidDomains: string[] = [];
  const cookieNameDomainMap: Array<{name: string, domain: string}> = [];
  
  // Check for literal \n vs actual newlines
  const hasLiteralNewlines = cookiesContent.includes('\\n');
  const hasActualNewlines = cookiesContent.includes('\n');
  
  console.log("=== ENV VAR FORMAT CHECK ===");
  console.log("Has literal \\n sequences:", hasLiteralNewlines);
  console.log("Has actual newline characters:", hasActualNewlines);
  console.log("Content length:", cookiesContent.length);
  console.log("First 200 chars:", cookiesContent.substring(0, 200));
  console.log("============================");
  
  // Parse cookies to extract names and domains
  const lines = cookiesContent.split(/\r?\n/); // Handle both \r\n and \n
  let isNetscapeFormat = false;
  let parsedLines = 0;
  
  console.log("=== COOKIE PARSING DEBUG ===");
  console.log("Total lines in content:", lines.length);
  console.log("First line:", lines[0]?.substring(0, 100));
  console.log("Last line:", lines[lines.length - 1]?.substring(0, 100));
  console.log("============================");
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      if (trimmedLine === '# Netscape HTTP Cookie File') {
        isNetscapeFormat = true;
      }
      continue;
    }
    
    // Netscape format: domain \t flag \t path \t secure \t expiration \t name \t value
    const parts = trimmedLine.split('\t');
    if (parts.length >= 7) {
      parsedLines++;
      const domain = parts[0];
      const name = parts[6];
      domains.add(domain);
      allCookieNames.push(name);
      cookieNameDomainMap.push({ name, domain });
      
      if (name === 'SAPISID') {
        hasSapisid = true;
        sapisidDomains.push(domain);
      } else if (name === '__Secure-3PAPISID') {
        hasSecure3Papisid = true;
        secure3papisidDomains.push(domain);
      } else if (name === '__Secure-1PAPISID') {
        hasSecure1Papisid = true;
        secure1papisidDomains.push(domain);
      }
    } else {
      console.log("Failed to parse line (not enough tabs):", trimmedLine.substring(0, 100));
      console.log("Line parts count:", parts.length);
    }
  }
  
  console.log("=== PARSED COOKIE NAMES ===");
  console.log("Total cookie names parsed:", allCookieNames.length);
  console.log("Cookie names:", JSON.stringify(allCookieNames, null, 2));
  console.log("Has SAPISID:", hasSapisid);
  console.log("Has __Secure-3PAPISID:", hasSecure3Papisid);
  console.log("Has __Secure-1PAPISID:", hasSecure1Papisid);
  console.log("============================");
  
  if (!hasSapisid && !hasSecure3Papisid) {
    console.log("=== COOKIE NAME-DOMAIN MAPPING ===");
    console.log("All parsed cookies with domains:");
    cookieNameDomainMap.forEach(({ name, domain }) => {
      console.log(`  ${name}: ${domain}`);
    });
    console.log("================================");
  }
  
  console.log("=== COOKIE PARSING RESULTS ===");
  console.log("Is Netscape format:", isNetscapeFormat);
  console.log("Total lines:", lines.length);
  console.log("Successfully parsed lines:", parsedLines);
  console.log("Total cookie names found:", allCookieNames.length);
  console.log("Unique domains:", Array.from(domains));
  console.log("Has SAPISID:", hasSapisid);
  console.log("SAPISID domains:", sapisidDomains);
  console.log("Has __Secure-3PAPISID:", hasSecure3Papisid);
  console.log("__Secure-3PAPISID domains:", secure3papisidDomains);
  console.log("Has __Secure-1PAPISID:", hasSecure1Papisid);
  console.log("__Secure-1PAPISID domains:", secure1papisidDomains);
  console.log("==============================");
  
  // According to latest yt-dlp: need at least SAPISID or __Secure-3PAPISID
  const hasRequiredAuth = hasSapisid || hasSecure3Papisid;
  const hasYoutubeDomain = Array.from(domains).some(d => d.includes('youtube.com'));
  
  // More lenient validation: allow proceeding without auth cookies but warn
  // This allows basic metadata fetch for public videos
  const valid = isNetscapeFormat && hasYoutubeDomain;
  
  const missing: string[] = [];
  if (!hasSapisid && !hasSecure3Papisid) {
    missing.push('SAPISID or __Secure-3PAPISID (required for age-gated or private videos)');
  }
  if (!hasYoutubeDomain) {
    missing.push('Cookies for youtube.com domain');
  }
  
  return {
    valid,
    missing,
    hasRequired: hasRequiredAuth,
    cookieNames: allCookieNames,
    domains: Array.from(domains),
    isNetscapeFormat,
    hasSapisid,
    hasSecure3Papisid,
    hasSecure1Papisid,
    sapisidDomains,
    secure3papisidDomains,
    secure1papisidDomains,
    totalLines: lines.length,
    parsedLines,
    cookieNameDomainMap
  };
}

/** Write cookies content to a temp file and return the path */
async function writeCookiesToTempFile(cookiesContent: string): Promise<string> {
  const id = randomBytes(8).toString("hex");
  const cookiesPath = join(tmpdir(), `cookies_${id}.txt`);
  
  // Validate cookies format
  const validation = validateYoutubeCookies(cookiesContent);
  
  console.log("=== COOKIE VALIDATION DEBUG ===");
  console.log("Is Netscape format:", validation.isNetscapeFormat);
  console.log("Has youtube.com domain:", validation.domains.some(d => d.includes('youtube.com')));
  console.log("Domains found:", validation.domains);
  console.log("Total cookie names:", validation.cookieNames.length);
  console.log("Cookie names:", validation.cookieNames);
  console.log("Has SAPISID:", validation.hasSapisid);
  console.log("SAPISID domains:", validation.sapisidDomains);
  console.log("Has __Secure-3PAPISID:", validation.hasSecure3Papisid);
  console.log("__Secure-3PAPISID domains:", validation.secure3papisidDomains);
  console.log("Has __Secure-1PAPISID:", validation.hasSecure1Papisid);
  console.log("__Secure-1PAPISID domains:", validation.secure1papisidDomains);
  console.log("Missing required cookies:", validation.missing);
  console.log("Has required auth cookies:", validation.hasRequired);
  console.log("Overall valid:", validation.valid);
  console.log("==============================");

  logger.info({ 
    cookiesLength: cookiesContent.length, 
    cookiesPath,
    tmpdir: tmpdir(),
    firstLine: cookiesContent.split('\n')[0]?.substring(0, 100),
    validation
  }, "Writing cookies to temp file");
  
  // Log warning if auth cookies are missing but don't fail
  if (!validation.hasRequired) {
    logger.warn({ 
      missing: validation.missing,
      hasSapisid: validation.hasSapisid,
      hasSecure3Papisid: validation.hasSecure3Papisid
    }, "Missing authentication cookies - may fail for age-gated or private videos");
  }
  
  // Only fail if format is fundamentally wrong
  if (!validation.valid) {
    const errorDetails = [];
    if (!validation.isNetscapeFormat) {
      errorDetails.push("Not in Netscape cookie format");
    }
    if (!validation.domains.some(d => d.includes('youtube.com'))) {
      errorDetails.push("No youtube.com domain found");
    }
    throw new Error(`Invalid YouTube cookies: ${errorDetails.join('; ')}. Please regenerate fresh cookies from YouTube.com.`);
  }
  
  await writeFileAsync(cookiesPath, cookiesContent, "utf8");
  const fileExists = existsSync(cookiesPath);
  logger.info({ 
    cookiesPath, 
    exists: fileExists,
    fileSize: fileExists ? (await statAsync(cookiesPath)).size : 0
  }, "Cookies file written successfully");
  return cookiesPath;
}

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
  const cookiesContent = process.env.YOUTUBE_COOKIES;
  let cookiesPath: string | null = null;

  // Log all relevant environment variables
  const relevantEnvVars = Object.keys(process.env)
    .filter(key => key.startsWith('YTDLP') || key.startsWith('YT_DLP') || key.startsWith('YOUTUBE') || key.startsWith('FORMAT'))
    .reduce((acc, key) => {
      acc[key] = process.env[key];
      return acc;
    }, {} as Record<string, string | undefined>);

  console.log("=== ENVIRONMENT VARIABLES DEBUG ===");
  console.log("Relevant env vars:", JSON.stringify(relevantEnvVars, null, 2));
  console.log("====================================");

  // Log yt-dlp version
  try {
    const { stdout: versionOutput } = await execFileAsync(YT_DLP, ["--version"], { timeout: 5000 });
    console.log("=== YT-DLP VERSION ===");
    console.log(versionOutput.trim());
    console.log("======================");
  } catch (err) {
    console.log("Failed to get yt-dlp version:", err);
  }

  logger.info({ 
    hasCookies: !!cookiesContent,
    cookiesLength: cookiesContent?.length || 0,
    relevantEnvVars
  }, "YOUTUBE_COOKIES environment variable status");

  // Try different player clients in order of preference
  const playerClients = [
    "android", 
    "android_vr", 
    "ios", 
    "web",
    "mweb"
  ];

  for (const playerClient of playerClients) {
    logger.info({ playerClient }, `Trying with player client: ${playerClient}`);

    // Base args with anti-bot detection measures
    const args = [
      "--ignore-config",  // Prevent reading config files that might have format settings
      "--dump-json",
      "--no-warnings",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "--referer", "https://www.youtube.com/",
      "--extractor-args", `youtube:player_client=${playerClient}`,
      "--no-check-certificates",
    ];

    // Only add --no-playlist for single videos, not playlists
    if (!isPlaylist) {
      args.push("--no-playlist");
    }

    if (cookiesContent) {
      cookiesPath = await writeCookiesToTempFile(cookiesContent);
      args.push("--cookies", cookiesPath);
    }

    args.push(url);

    console.log("=== YTDLP ARGS DEBUG ===");
    console.log("Full args array:", JSON.stringify(args, null, 2));
    console.log("Args as string:", args.join(" "));
    console.log("Has -f flag:", args.includes("-f"));
    console.log("Has --format flag:", args.includes("--format"));
    console.log("YT_DLP executable:", YT_DLP);
    console.log("========================");

    logger.info({ 
      args: args.join(" "),
      hasCookiesArg: args.includes("--cookies"),
      cookiesPath,
 attempts: playerClients 
    }, "yt-dlp arguments configured");

    try {
      console.log("=== EXECUTING COMMAND ===");
      console.log("Command:", YT_DLP, args.join(" "));
      console.log("========================");

      const { stdout, stderr } = await execFileAsync(YT_DLP, args, {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      
      // Log stderr output for debugging
      if (stderr) {
        logger.warn({ stderr: stderr.substring(0, 1000) }, "yt-dlp stderr output");
      }
      
      // Clean up temp cookies file if it was created
      if (cookiesPath) {
        unlinkAsync(cookiesPath).catch(() => {});
      }
      logger.info({ playerClient }, `Successfully fetched with player client: ${playerClient}`);
      return JSON.parse(stdout.trim());
    } catch (err) {
      // Clean up temp cookies file on error
      if (cookiesPath) {
        unlinkAsync(cookiesPath).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : "";
      
      // Log the full error for debugging
      logger.error({ error: msg, hasCookies: !!cookiesContent, cookiesPath, playerClient }, `yt-dlp execution failed with player client: ${playerClient}`);
      
      // If this is the last attempt, throw the error
      if (playerClient === playerClients[playerClients.length - 1]) {
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
          throw new Error("YouTube is blocking automated requests. Your cookies may be expired or invalid. Please regenerate fresh YouTube cookies and update YOUTUBE_COOKIES in Render.");
        }
        
        // Don't fail on format errors for analyze endpoint - it's just metadata
        // Format errors only matter for actual downloads
        if (msg.includes("format is not available") || msg.includes("Requested format")) {
          logger.warn({ error: msg }, "Format error during metadata fetch, but this is just analysis - ignoring");
          // This is metadata analysis, not download, so format doesn't matter
          // Try to return whatever we can parse from the error output
          throw new Error(`Video metadata unavailable: ${msg}`);
        }
        
        // Generic error with original message
        throw new Error(`Failed to fetch video information: ${msg}`);
      }
      
      // Otherwise, continue to next player client
      logger.info(`Retrying with next player client...`);
      continue;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error("All player client attempts failed");
}

router.post("/analyze", async (req: Request, res: Response) => {
  console.log("BUILD_MARKER_7eaba53");
  console.log("DEBUG BUILD 48bad79 - Cookie validation debugging");
  
  res.setHeader("X-Build", "dd4ef7d");
  
  req.log.info({ 
    method: req.method, 
    url: req.url, 
    headers: req.headers, 
    body: req.body,
    origin: req.headers.origin 
  }, "Incoming /api/analyze request");

  const { url } = req.body as { url?: string };

  if (!url || typeof url !== "string") {
    req.log.warn({ body: req.body }, "Invalid request - URL missing");
    res.status(400).json({ error: "INVALID_REQUEST", message: "URL is required" });
    return;
  }

  const normalised = normaliseYouTubeUrl(url);
  if (!normalised) {
    req.log.warn({ url }, "Invalid URL format");
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
    // Add fallback to best if specific height not available
    return `best[height<=${h}][ext=mp4]/best[height<=${h}]/best[ext=mp4]/best`;
  }
  // Fallback to mp4 first, then any format
  return "best[ext=mp4]/best";
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

  // yt-dlp args with anti-bot detection measures
  const cookiesContent = process.env.YOUTUBE_COOKIES;
  let cookiesPath: string | null = null;

  logger.info({ 
    hasCookies: !!cookiesContent,
    cookiesLength: cookiesContent?.length || 0 
  }, "Download: YOUTUBE_COOKIES environment variable status");

  const args: string[] = [
    "--ignore-config",  // Prevent reading config files that might have format settings
    "--no-playlist",
    "-o", tmpPath,
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--referer", "https://www.youtube.com/",
    "--extractor-args", "youtube:player_client=android",
    "--no-check-certificates",
  ];

  if (cookiesContent) {
    cookiesPath = await writeCookiesToTempFile(cookiesContent);
    args.push("--cookies", cookiesPath);
  }

  logger.info({ 
    args: args.join(" "),
    hasCookiesArg: args.includes("--cookies"),
    cookiesPath 
  }, "Download: yt-dlp arguments configured");

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push("-f", ytdlpVideoFormat(quality));
  }

  args.push(normalised);

  req.log.info({ args: args.join(" ") }, "Launching yt-dlp");

  // Run yt-dlp to completion (downloads HLS segments + merges)
  try {
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
  } finally {
    // Clean up temp cookies file if it was created
    if (cookiesPath) {
      unlinkAsync(cookiesPath).catch(() => {});
    }
  }

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

// ─── Cookie Debug Endpoint ─────────────────────────────────────────────────────
router.get("/debug/cookies", (_req, res) => {
  const cookiesContent = process.env.YOUTUBE_COOKIES;
  
  if (!cookiesContent) {
    res.json({
      hasCookies: false,
      totalCookies: 0,
      hasSapisid: false,
      hasSecure3Papisid: false,
      hasSecure1Papisid: false,
      parsed: false,
      error: "YOUTUBE_COOKIES environment variable not set"
    });
    return;
  }
  
  try {
    const validation = validateYoutubeCookies(cookiesContent);
    
    res.json({
      hasCookies: true,
      totalCookies: validation.totalLines,
      parsedCookies: validation.parsedLines,
      hasSapisid: validation.hasSapisid,
      hasSecure3Papisid: validation.hasSecure3Papisid,
      hasSecure1Papisid: validation.hasSecure1Papisid,
      sapisidDomains: validation.sapisidDomains,
      secure3papisidDomains: validation.secure3papisidDomains,
      secure1papisidDomains: validation.secure1papisidDomains,
      isNetscapeFormat: validation.isNetscapeFormat,
      valid: validation.valid,
      missing: validation.missing,
      cookieNames: validation.cookieNames.slice(0, 20), // First 20 cookie names
      domains: validation.domains,
      parsed: true,
      build: "dd4ef7d"
    });
  } catch (error) {
    res.json({
      hasCookies: true,
      parsed: false,
      error: error instanceof Error ? error.message : "Unknown error during validation"
    });
  }
});

export default router;
