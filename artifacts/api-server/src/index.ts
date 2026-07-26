import app from "./app";
import { logger } from "./lib/logger";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Log environment variables on startup for debugging
logger.info({ 
  hasYoutubeCookies: !!process.env.YOUTUBE_COOKIES,
  cookiesLength: process.env.YOUTUBE_COOKIES?.length || 0,
  ytDlpPath: process.env.YT_DLP_PATH,
  corsOrigins: process.env.CORS_ORIGINS
}, "Environment variables loaded on startup");

// Check yt-dlp version on startup - use system-installed from pip
let YT_DLP: string = process.env.YT_DLP_PATH || "yt-dlp";

console.log("=== PATH RESOLUTION DEBUG ===");
console.log("process.cwd():", process.cwd());
console.log("__dirname:", __dirname);
console.log("process.env.YT_DLP_PATH:", process.env.YT_DLP_PATH);
console.log("Initial YT_DLP:", YT_DLP);

// If YT_DLP_PATH is set to a relative path, ignore it and use system PATH
if (YT_DLP.startsWith("./") || YT_DLP.startsWith(".\\")) {
  console.log("Ignoring relative YT_DLP_PATH, using system PATH");
  YT_DLP = "yt-dlp";
}

console.log("Final YT_DLP executable:", YT_DLP);
console.log("========================");
(async () => {
  try {
    const { stdout: ytDlpVersion } = await execFileAsync(YT_DLP, ["--version"], { timeout: 5000 });
    logger.info({ ytDlpVersion: ytDlpVersion.trim(), executable: YT_DLP }, "yt-dlp version check");
  } catch (err) {
    // Don't fail startup - just log warning
    logger.warn({ error: err instanceof Error ? err.message : "Unknown error", executable: YT_DLP }, "Failed to check yt-dlp version - app will start anyway");
  }
  
  // Check ffmpeg version on startup
  try {
    const { stdout: ffmpegVersion } = await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    const firstLine = ffmpegVersion.split('\n')[0];
    logger.info({ ffmpegVersion: firstLine }, "ffmpeg version check");
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : "Unknown error" }, "Failed to check ffmpeg version");
  }
})();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
