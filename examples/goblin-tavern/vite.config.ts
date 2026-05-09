import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@bjalon/object-vcs-core": new URL(
        "../../packages/core/src/index.ts",
        import.meta.url
      ).pathname,
      "@bjalon/object-vcs-firebase": new URL(
        "../../packages/firebase/src/index.ts",
        import.meta.url
      ).pathname,
      "@bjalon/object-vcs-react": new URL(
        "../../packages/react/src/index.ts",
        import.meta.url
      ).pathname
    }
  }
});
