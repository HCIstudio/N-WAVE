import dotenv from "dotenv";
import { createApp } from "./app";
import connectDB from "./config/db";

// Load environment variables from .env file (quietly: dotenv 17+ otherwise
// logs a line every time it loads one).
dotenv.config({ quiet: true });

connectDB();

const app = createApp();
const PORT = Number(process.env.PORT) || 5001;
// Only this computer by default: there is no login, and runs can start
// containers on the host's Docker. The Docker image sets HOST=0.0.0.0 so the
// frontend container can reach it; its published ports stay on 127.0.0.1.
const HOST = process.env.HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
