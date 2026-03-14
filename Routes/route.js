import express from "express"
import { LoginUser, RegisterUser } from "../Controller/Usercontroller.js";

import { createProfile } from "../Controller/Profilecontroler.js";
import {
  getMyProcessedDocuments,
  processUploadedDocument,
} from "../Controller/documentController.js";
import { recommendSchemes } from "../Controller/recommendationController.js";
import { previewAutomationPlan } from "../Controller/automationController.js";
import recommendationRoutes from "./recommendationRoutes.js";
import documentRoutes from "./documentRoutes.js";
import automationRoutes from "./automationRoutes.js";

import { verifyToken } from "../auth/verifytoken.js";
const router=express.Router();


router.post("/Register",RegisterUser);
router.post("/register",RegisterUser);
router.post("/login",LoginUser);
router.post("/mydata",verifyToken,createProfile)
router.post("/profile",verifyToken,createProfile)

// Backward-compatible endpoint aliases for legacy frontend clients.
router.post("/upload-document", verifyToken, processUploadedDocument);
router.post("/extract-document-data", verifyToken, processUploadedDocument);
router.get("/get-user-documents", verifyToken, getMyProcessedDocuments);
router.get("/recommend-schemes", verifyToken, recommendSchemes);
router.post("/apply-scheme", verifyToken, previewAutomationPlan);

router.use("/scheme", recommendationRoutes);
router.use("/documents", documentRoutes);
router.use("/automation", automationRoutes);

export default router;
