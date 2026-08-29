import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const publicMedia = join(root, "public", "media");
const workflowFile = join(root, ".github", "workflows", "deploy.yml");
const routes = [
  "/",
  "/about",
  "/contacts",
  "/zewa",
  "/neskazki",
  "/barcode-mysteries",
  "/megafon",
  "/baltika",
  "/beeline",
  "/wink-80s",
  "/ikea-copywriting",
  "/crave",
];

const failures = [];
const routeFile = (route) =>
  route === "/" ? join(dist, "index.html") : join(dist, route.slice(1), "index.html");

for (const route of routes) {
  const file = routeFile(route);
  if (!existsSync(file)) {
    failures.push(`missing route: ${route}`);
    continue;
  }

  const html = readFileSync(file, "utf8");
  if (!html.includes('<html lang="ru">')) failures.push(`wrong lang: ${route}`);
  if (/previous work|next work|all work/i.test(html)) failures.push(`English utility navigation: ${route}`);
  if (/Personal OS|_recordings|personal brief/i.test(html)) failures.push(`private-source marker: ${route}`);
  if (!/http-equiv="Content-Security-Policy"/i.test(html)) failures.push(`missing CSP: ${route}`);
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) failures.push(`inline script: ${route}`);
  if (/(?:href|src|poster)="http:\/\//i.test(html)) failures.push(`insecure HTTP target: ${route}`);

  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    if (!/\brel="[^"]*noreferrer[^"]*"/i.test(match[0])) {
      failures.push(`target=_blank without noreferrer: ${route}`);
    }
  }

  for (const match of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
    const target = match[1];
    if (!target.startsWith("/") || target.startsWith("//")) continue;
    const clean = target.split(/[?#]/, 1)[0];
    const resolved = /\.[a-z0-9]+$/i.test(clean)
      ? join(dist, clean.slice(1))
      : routeFile(clean);
    if (!existsSync(resolved)) failures.push(`broken internal target on ${route}: ${target}`);
  }
}

if (!existsSync(join(dist, "site.js"))) failures.push("missing external site.js");

const workflow = readFileSync(workflowFile, "utf8");
if (/^\s*push:/m.test(workflow)) failures.push("deployment workflow must remain manual-only");
if (!/^\s*workflow_dispatch:\s*$/m.test(workflow)) failures.push("missing manual workflow trigger");
if (!/^permissions:\s*\{\}\s*$/m.test(workflow)) failures.push("workflow permissions are not deny-by-default");
for (const match of workflow.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)) {
  if (!/^[0-9a-f]{40}$/.test(match[1])) failures.push(`unpinned GitHub Action: ${match[0]}`);
}
if (!/uses:\s*actions\/checkout@[^\n]+\n\s+with:\s*\n\s+persist-credentials:\s*false/m.test(workflow)) {
  failures.push("checkout credentials must not persist");
}

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const mediaFiles = walk(publicMedia);
const tooLarge = mediaFiles.filter((file) => statSync(file).size > 95 * 1024 * 1024);
if (tooLarge.length) failures.push(`media files above 95 MiB: ${tooLarge.join(", ")}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const bytes = mediaFiles.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`${routes.length} routes verified; ${mediaFiles.length} media files; ${(bytes / 1024 / 1024).toFixed(1)} MiB.`);
