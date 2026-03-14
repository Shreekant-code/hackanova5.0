import express from "express";
import multer from "multer";
import { verifyToken } from "../auth/verifytoken.js";
import {
  getRequiredDocumentStatus,
  getMyProcessedDocuments,
  processUploadedDocument,
  uploadAndProcessDocument,
} from "../Controller/documentController.js";

const documentRoutes = express.Router();
const multipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_DOCUMENT_BYTES || 8 * 1024 * 1024),
  },
});

documentRoutes.post("/process", verifyToken, processUploadedDocument);
documentRoutes.post(
  "/upload-and-process",
  verifyToken,
  multipartUpload.single("file"),
  uploadAndProcessDocument
);
documentRoutes.get("/my", verifyToken, getMyProcessedDocuments);
documentRoutes.post("/required-status", verifyToken, getRequiredDocumentStatus);

export default documentRoutes;
