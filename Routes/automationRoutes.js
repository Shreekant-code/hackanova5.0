import express from "express";
import { verifyToken } from "../auth/verifytoken.js";
import {
  crawlApplicationPortal,
  executeAutomationPlan,
  generateManualFallbackGuide,
  generateFormAutofillPlan,
  getAutomationSession,
  previewAutomationPlan,
} from "../Controller/automationController.js";

const automationRoutes = express.Router();

automationRoutes.post("/crawl", verifyToken, crawlApplicationPortal);
automationRoutes.post("/generate-steps", verifyToken, generateFormAutofillPlan);
automationRoutes.post("/fallback-guide", verifyToken, generateManualFallbackGuide);
automationRoutes.post("/preview", verifyToken, previewAutomationPlan);
automationRoutes.post("/execute", verifyToken, executeAutomationPlan);
automationRoutes.get("/session/:id", verifyToken, getAutomationSession);

export default automationRoutes;
