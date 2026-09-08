import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

export default defineConfig({
  base: "http://localhost:5001/",
  plugins: [
    react(),
    federation({
      name: "remote_trading",
      filename: "remoteEntry.js",
      exposes: { "./Panel": "./src/Panel.tsx" },
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
        "react-redux": { singleton: true },
        "@reduxjs/toolkit": { singleton: true },
        "@mui/material": { singleton: true },
        "@emotion/react": { singleton: true },
        "@emotion/styled": { singleton: true },
      },
    }),
  ],
  server: { port: 5001, strictPort: true },
  build: { target: "esnext", modulePreload: false, cssCodeSplit: false },
});
