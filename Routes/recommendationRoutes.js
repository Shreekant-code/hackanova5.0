import express from "express";
import { verifyToken } from "../auth/verifytoken.js";
import { recommendSchemes, searchSchemes } from "../Controller/recommendationController.js";

const recommendationRoutes = express.Router();

recommendationRoutes.get("/recommend-schemes", verifyToken, recommendSchemes);
recommendationRoutes.post("/search-schemes", verifyToken, searchSchemes);

export default recommendationRoutes;
