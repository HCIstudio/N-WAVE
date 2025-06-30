import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors, { CorsOptions } from "cors";
import path from "path";
import fs from "fs";
import connectDB from "./config/db"; // Uncommented
import workflowRoutes from "./routes/workflowRoutes"; // Uncommented and to be used
import executeRoutes from "./routes/executeRoutes";
import fileRoutes from "./routes/fileRoutes"; // Import the new file routes
import processRoutes from "./routes/processRoutes"; // Import the process routes

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app: Express = express();

// Connect to Database
connectDB(); // Uncommented

// Define allowed origins for CORS
const allowedOrigins = ["http://localhost:5173"]; // Add your frontend origin

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // If you plan to use cookies or authorization headers
};

// Middlewares
app.use(cors(corsOptions)); // Use CORS with options
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Basic Route
app.get("/", (req: Request, res: Response) => {
  res.send("Backend server is running!");
});

// API Routes
app.use("/api/files", fileRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/execute", executeRoutes);
app.use("/api/process", processRoutes);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
