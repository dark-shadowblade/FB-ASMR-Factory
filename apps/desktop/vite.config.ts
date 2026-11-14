import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Electron loads the production renderer with file:// via loadFile().
  // Relative asset URLs are required; absolute /assets paths resolve to the drive root on Windows.
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true }
});