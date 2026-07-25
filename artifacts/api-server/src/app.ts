import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.0.101:5173'];

logger.info({ cors_origins: allowedOrigins }, "CORS allowed origins configured");

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Allow if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Temporarily allow all origins for debugging - remove after fixing
      logger.warn({ origin, allowedOrigins }, "CORS blocked - origin not in allowed list, but allowing for debugging");
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Log all registered routes on startup
function printRoutes(app: Express) {
  console.log("=== REGISTERED ROUTES ===");
  const routes: string[] = [];
  
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      // Direct route
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods).join(', ');
      routes.push(`${methods.toUpperCase()} ${path}`);
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).join(', ');
          routes.push(`${methods.toUpperCase()} /api${path}`);
        }
      });
    }
  });
  
  routes.sort().forEach(route => console.log(route));
  console.log("========================");
  
  logger.info({ routes, total: routes.length }, "Registered Express routes");
}

printRoutes(app);

export default app;
