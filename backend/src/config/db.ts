import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
    }

    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error(
        "Error: MONGODB_URI is not defined. Make sure .env file exists and is loaded."
      );
      process.exit(1);
    }

    await mongoose.connect(mongoURI);

    console.log("MongoDB Connected...");
  } catch (err: any) {
    console.error("MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

export default connectDB;
