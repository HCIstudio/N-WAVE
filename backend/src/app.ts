import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors, { type CorsOptions } from "cors";
import workflowRoutes from "./routes/workflowRoutes";
import executeRoutes from "./routes/executeRoutes";
import nfcoreRoutes from "./routes/nfcoreRoutes";
import customNodeRoutes from "./routes/customNodeRoutes";
import { getErrorMessage } from "./utils/errors";

/** Maximum JSON/urlencoded request body; input file contents travel inline. */
export const REQUEST_BODY_LIMIT = "50mb";

const parseAllowedOrigins = (): string[] =>
  (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:8080")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/** Build the Express app. Kept separate from server.ts so tests can import it. */
export const createApp = (): Express => {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (!allowedOrigins.includes(origin)) {
        return callback(
          new Error(
            "The CORS policy for this site does not allow access from the specified Origin."
          ),
          false
        );
      }
      return callback(null, true);
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

  app.get("/", (_req: Request, res: Response) => {
    res.send("Backend server is running!");
  });

  app.use("/api/workflows", workflowRoutes);
  app.use("/api/execute", executeRoutes);
  app.use("/api/nfcore", nfcoreRoutes);
  app.use("/api/custom-nodes", customNodeRoutes);

  // Turn body-parser failures (malformed JSON, oversized bodies) into JSON
  // errors instead of Express's default HTML page.
  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      next: NextFunction
    ): void => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : 500;
      res.status(status).json({
        message: status === 413 ? "Request body too large" : "Request failed",
        error: getErrorMessage(error),
      });
    }
  );

  return app;
};
