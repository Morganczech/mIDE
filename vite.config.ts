import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: ["es2022", "chrome105", "safari15"],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
            },
            {
              name: "editor",
              test: /node_modules\/(@codemirror\/(state|view|commands|language|search)|@lezer\/(common|lr|highlight))\//,
            },
            {
              name: "languages",
              test: /node_modules\/(@codemirror\/lang-|@lezer\/(html|css|javascript|json|markdown)|@fazelstudio)/,
            },
          ],
        },
      },
    },
  },
});
