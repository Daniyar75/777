import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only proxy so the browser never needs CORS config to talk to apps/api. The API client
// (src/api/client.ts) always calls "${API_BASE}${path}" with API_BASE defaulting to "/api" —
// production deployments set VITE_API_BASE_URL to the real backend origin instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
