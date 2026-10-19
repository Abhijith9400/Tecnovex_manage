import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  sendSuccess(res, { status: "ok", time: new Date().toISOString() });
});
