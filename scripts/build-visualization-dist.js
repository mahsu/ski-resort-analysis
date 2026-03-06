#!/usr/bin/env node
/**
 * Build visualization for deploy: minified index.html, style.css, main.js (bundle), and JSON data.
 * Copy the contents of dist/ into your target subfolder (e.g. ski/) to deploy.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import * as os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VIZ = path.join(ROOT, "src", "visualization");
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");
const DEPLOY_CONFIG_PATH = path.join(ROOT, "config", "deploy.json");

/**
 * Load GA measurement ID: from env GA_MEASUREMENT_ID, or config/deploy.json (optional).
 * config/deploy.json is gitignored; copy config/deploy.example.json and set gaMeasurementId.
 */
async function loadGaMeasurementId() {
  const fromEnv = process.env.GA_MEASUREMENT_ID;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const raw = await fs.readFile(DEPLOY_CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    const id = config.gaMeasurementId;
    return typeof id === "string" && id.trim() ? id.trim() : "";
  } catch {
    return "";
  }
}

function gaSnippet(measurementId) {
  return `  <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
      gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
  });
    gtag('config', '${measurementId}');
  </script>
`;
}

function minifyJson(content) {
  return JSON.stringify(JSON.parse(content));
}

function minifyCss(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function minifyHtml(content) {
  return content
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  await fs.mkdir(path.join(DIST, "data", "resorts"), { recursive: true });

  // 1. Minify and write JSON data
  const aggregatePath = path.join(DATA, "aggregate_stats.json");
  const aggregate = await fs.readFile(aggregatePath, "utf8");
  await fs.writeFile(
    path.join(DIST, "data", "aggregate_stats.json"),
    minifyJson(aggregate)
  );

  const resortsDir = path.join(DATA, "resorts");
  const resortFiles = await fs.readdir(resortsDir);
  for (const name of resortFiles) {
    if (!name.endsWith(".json")) continue;
    const content = await fs.readFile(path.join(resortsDir, name), "utf8");
    await fs.writeFile(
      path.join(DIST, "data", "resorts", name),
      minifyJson(content)
    );
  }

  // 2. Minify and write CSS
  const css = await fs.readFile(path.join(VIZ, "style.css"), "utf8");
  await fs.writeFile(path.join(DIST, "style.css"), minifyCss(css));

  // 3. Bundle JS with dist config (temp dir)
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "viz-build-"));
  try {
    const jsFiles = await fs.readdir(VIZ);
    for (const name of jsFiles) {
      if (!name.endsWith(".js")) continue;
      const src = path.join(VIZ, name);
      await fs.copyFile(src, path.join(tempDir, name));
    }
    await fs.writeFile(
      path.join(tempDir, "config.js"),
      'export const DATA_BASE = "data/";\n'
    );

    const { build } = await import("esbuild");
    await build({
      entryPoints: [path.join(tempDir, "app.js")],
      bundle: true,
      format: "esm",
      minify: true,
      outfile: path.join(DIST, "app.js"),
      platform: "browser",
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  // 4. HTML: inject GA if configured, then minify
  let html = await fs.readFile(path.join(VIZ, "index.html"), "utf8");
  const gaId = await loadGaMeasurementId();
  const gaBlock = gaId ? gaSnippet(gaId) : "";
  html = html.replace("<!-- INJECT_GA -->", gaBlock);
  await fs.writeFile(path.join(DIST, "index.html"), minifyHtml(html));

  console.log("Built dist/ (minified index.html, style.css, app.js, data/)");
  if (gaId) console.log("  GA: injected", gaId);
  else console.log("  GA: none (set config/deploy.json gaMeasurementId or GA_MEASUREMENT_ID)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
