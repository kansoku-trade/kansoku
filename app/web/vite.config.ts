import { readFileSync } from "node:fs";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const KERNEL_PORT = Number(process.env.KERNEL_PORT || 5200);
const KERNEL_URL = `http://localhost:${KERNEL_PORT}`;
const APP_VERSION = JSON.parse(readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    port: 5199,
    proxy: {
      "/api": { target: KERNEL_URL, ws: true },
      "/legacy": { target: KERNEL_URL },
    },
  },
});
