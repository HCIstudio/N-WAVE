import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

/**
 * Connect to MongoDB, but do NOT crash the process if the first attempt fails.
 * This is important in Docker where Mongo may not be ready the moment
 * the backend container starts.
 */
const connectDB = async (
  maxRetries: number = 10,
  retryDelayMs: number = 5000
): Promise<void> => {
  // If MONGODB_URI isn't set yet, try loading from .env (mainly for local dev)
  if (!process.env.MONGODB_URI) {
    dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
  }

  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    console.error(
      "Error: MONGODB_URI is not defined. Make sure .env or Docker env is set."
    );
    // Don't kill the process – app can still serve non-DB routes.
    return;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(mongoURI);
      console.log("MongoDB Connected...");
      return;
    } catch (err: any) {
      const message = err?.message || err;
      console.error(
        `MongoDB Connection Error (attempt ${attempt}/${maxRetries}):`,
        message
      );

      if (attempt === maxRetries) {
        console.error(
          "Giving up on MongoDB connection for now. Backend will continue running, but database features will not work until you restart the container."
        );
        return;
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

export default connectDB;
