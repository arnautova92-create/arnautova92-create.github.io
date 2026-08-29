import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: { enabled: false },
  output: "static",
  site: "https://andreiarnautov.com",
  trailingSlash: "never",
});
