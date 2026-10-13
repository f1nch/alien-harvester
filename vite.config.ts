import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    rolldownOptions: {
      output: {
        // The lazily loaded glTF loader shares Babylon core with the app. Without groups,
        // that sharing splits core into ~200 tiny chunks the first load must fetch.
        codeSplitting: {
          groups: [
            // $initial: only modules the first load needs, so Babylon's own lazy imports stay lazy.
            { name: "babylon", test: /node_modules[\\/]@babylonjs[\\/]core[\\/]/, tags: ["$initial"] },
            { name: "gltf", test: /node_modules[\\/]@babylonjs[\\/]loaders[\\/]/ },
          ],
        },
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
