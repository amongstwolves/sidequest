// MapLibre runs tile parsing in a Web Worker. Next's bundler doesn't emit that worker file,
// so copy it into public/ on install and point MapLibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), join(root, "public", "maplibre-gl-worker.mjs"));
console.log("copied maplibre-gl-worker.mjs to public/");
