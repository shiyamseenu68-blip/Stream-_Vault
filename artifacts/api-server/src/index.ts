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

// Check yt-dlp version on startup - diagnose PATH and availability
console.log("=== PATH AND YT-DLP DIAGNOSTICS ===");
console.log("process.cwd():", process.cwd());
console.log("__dirname:", __dirname);
console.log("process.env.YT_DLP_PATH:", process.env.YT_DLP_PATH);
console.log("process.env.PATH:", process.env.PATH);

(async () => {
  // Run diagnostic commands
  try {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    
    console.log("--- Running which yt-dlp ---");
    try {
      const { stdout: whichOutput } = await execAsync("which yt-dlp");
      console.log("which yt-dlp:", whichOutput.trim());
    } catch (e) {
      console.log("which yt-dlp: NOT FOUND");
    }
    
    console.log("--- Running command -v yt-dlp ---");
    try {
      const { stdout: commandOutput } = await execAsync("command -v yt-dlp");
      console.log("command -v yt-dlp:", commandOutput.trim());
    } catch (e) {
      console.log("command -v yt-dlp: NOT FOUND");
    }
    
    console.log("--- Checking /usr/local/bin/yt-dlp ---");
    try {
      const { stdout: lsOutput } = await execAsync("ls -la /usr/local/bin/yt-dlp");
      console.log("ls -la /usr/local/bin/yt-dlp:", lsOutput.trim());
    } catch (e) {
      console.log("ls -la /usr/local/bin/yt-dlp: NOT FOUND");
    }
  } catch (e) {
    console.log("Diagnostic commands failed:", e);
  }
})();

// Use Python module instead of binary
const YT_DLP = process.env.YT_DLP_PATH || "python3";
const YT_DLP_ARGS = ["-m", "yt_dlp"];

console.log("Final YT_DLP executable:", YT_DLP);
console.log("YT_DLP will be executed as:", YT_DLP, YT_DLP_ARGS.join(" "));
console.log("========================");
(async () => {
  try {
    console.log("=== ABOUT TO EXECUTE YT-DLP ===");
    console.log("Executable being used:", YT_DLP);
    console.log("Full command:", YT_DLP, [...YT_DLP_ARGS, "--version"].join(" "));
    console.log("===============================");
    const { stdout: ytDlpVersion } = await execFileAsync(YT_DLP, [...YT_DLP_ARGS, "--version"], { timeout: 5000 });
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
