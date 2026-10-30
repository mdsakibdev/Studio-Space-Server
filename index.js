import "dotenv/config";

import express from "express";
import cors from "cors";

import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";

// Create Express application
const app = express();

const PORT = process.env.PORT || 5000;

// Enable CORS for frontend
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

// Better Auth API routes
// Express 5 catch-all route
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

// Test API
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "StudioSpace Backend is running!",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
