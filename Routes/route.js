import express from "express"
import { LoginUser, RegisterUser } from "../Controller/Usercontroller.js";

import { createProfile } from "../Controller/Profilecontroler.js";

import { verifyToken } from "../auth/verifytoken.js";
const router=express.Router();


router.post("/Register",RegisterUser);
router.post("/login",LoginUser);
router.post("/mydata",verifyToken,createProfile)

export default router;