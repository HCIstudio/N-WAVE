import dotenv from "dotenv";
import { createApp } from "./app";
import connectDB from "./config/db";

// Load environment variables from .env file
dotenv.config();

connectDB();

const app = createApp();
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
