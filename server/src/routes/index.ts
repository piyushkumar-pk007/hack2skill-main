import { Router } from "express";
import authRouter from "./auth.js";
import experiencesRouter from "./experiences.js";
import healthRouter from "./health.js";
import preferencesRouter from "./preferences.js";
import tripsRouter from "./trips.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use(healthRouter);
apiRouter.use(preferencesRouter);
apiRouter.use(tripsRouter);
apiRouter.use(experiencesRouter);

export default apiRouter;
