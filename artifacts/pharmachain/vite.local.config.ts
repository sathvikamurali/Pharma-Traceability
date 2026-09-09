import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Local development config — uses real Express API server + PostgreSQL
// Make sure the API server is running BEFORE starting Vite:
//   Terminal 1 (API server):
//     cd artifacts/api-server
//     $env:PORT="3001"; $env:DATABASE_URL="postgresql://postgres:radmin@localhost:5432/postgres"; $env:CONTRACT_ADDRESS="0x45f323D8E62c75f17D99c1B52c61A1D65C45F382"; node --enable-source-maps ./dist/index.mjs
//
//   Terminal 2 (Frontend):
//     cd artifacts/pharmachain
//     npx vite --config vite.local.config.ts

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "localhost",
    proxy: {
      // Forward all /api/* to the real Express server (port 3001)
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
