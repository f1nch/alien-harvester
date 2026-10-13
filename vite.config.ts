import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
