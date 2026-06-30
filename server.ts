/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
dotenv.config();

// Production-ready Express application server integrated with dynamic Vite middleware,
// serving REST API services on /api/* and front-end assets instantly.

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import authRoutes from "./server/routes/authRoutes";
import issueRoutes from "./server/routes/issueRoutes";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsers with generous limits to support Citizen base64 photos easily
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // Debugging logger middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // REST API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/issues", issueRoutes);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "active", uptime: process.uptime() });
  });

  // Vite development asset server or statically compiled assets serving
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Express backend in local DEVELOPMENT mode with hot Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting Express backend in PRODUCTION static-compiled container mode...");
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files from modern Vite client build folder
    app.use(express.static(distPath));
    
    // Single Page App routing fallback
    app.get('*', (req, res) => {
      if (req.accepts('html')) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        res.status(404).type('txt').send('Resource not found');
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`===========================================================`);
    console.log(`🚀 COMMUNITY HERO CONTAINER ACTIVE`);
    console.log(`📡 Server listening on: http://0.0.0.0:${PORT}`);
    console.log(`💎 AI Gatekeeper mode: ${process.env.GEMINI_API_KEY ? "ONLINE (Gemini Live)" : "DEMO Mode (Graceful Auto-Filter fallback)"}`);
    console.log(`===========================================================`);
  });
}

startServer().catch((err) => {
  console.error("Critical server bootstrap failure:", err);
  process.exit(1);
});
