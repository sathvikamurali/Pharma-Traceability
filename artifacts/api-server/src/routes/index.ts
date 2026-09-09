import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pharmachainRouter from "./pharmachain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pharmachainRouter);

export default router;
