import app from "./app";
import { logger } from "./lib/logger";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
