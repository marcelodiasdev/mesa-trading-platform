import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "host",
      remotes: {
        remote_portfolio: {
          type: "module",
          name: "remote_portfolio",
          entry: "http://localhost:5002/remoteEntry.js",
        },
        remote_trading: {
          type: "module",
          name: "remote_trading",
          entry: "http://localhost:5001/remoteEntry.js",
        },
      },
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
  server: { port: 5000, strictPort: true },
  build: { target: "esnext", modulePreload: false },
});
