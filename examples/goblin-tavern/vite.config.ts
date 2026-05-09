import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = "qastia-gitlight";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? `/${repositoryName}/` : "/",
  plugins: [react()]
});
