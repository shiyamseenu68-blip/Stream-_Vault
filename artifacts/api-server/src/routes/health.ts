import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Support both /health and /healthz
router.get("/health", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("X-Build", "dd4ef7d");
  res.json({ ...data, build: "dd4ef7d" });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("X-Build", "dd4ef7d");
  res.json({ ...data, build: "dd4ef7d" });
});

export default router;
