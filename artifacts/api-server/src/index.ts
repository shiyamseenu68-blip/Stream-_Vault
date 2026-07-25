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

// Check yt-dlp version on startup
const YT_DLP = process.env.YT_DLP_PATH || "yt-dlp";
(async () => {
  try {
    const { stdout: ytDlpVersion } = await execFileAsync(YT_DLP, ["--version"], { timeout: 5000 });
    logger.info({ ytDlpVersion: ytDlpVersion.trim() }, "yt-dlp version check");
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : "Unknown error" }, "Failed to check yt-dlp version");
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
