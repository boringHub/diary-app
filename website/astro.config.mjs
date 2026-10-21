import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  base: process.env.SITE_BASE || "/",
  site: process.env.SITE_URL || undefined,
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
