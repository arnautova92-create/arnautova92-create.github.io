import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: { enabled: false },
  output: "static",
  site: "https://arnautova92-create.github.io",
  trailingSlash: "never",
});
