#!/usr/bin/env node
/**
 * Build visualization for deploy: minified index.html, style.css, main.js (bundle), and JSON data.
 * Copy the contents of dist/ into your target subfolder (e.g. ski/) to deploy.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import * as os from "os";
import { minify as minifyPkg } from "minify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VIZ = path.join(ROOT, "src", "visualization");
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");
const DEPLOY_CONFIG_PATH = path.join(ROOT, "config", "deploy.json");

/**
 * Load deploy config from config/deploy.json (optional). config/deploy.json is gitignored.
 */
async function loadDeployConfig() {
  try {
    const raw = await fs.readFile(DEPLOY_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Umami website ID: from env UMAMI_WEBSITE_ID, or deploy config. */
async function loadUmamiWebsiteId() {
  const fromEnv = process.env.UMAMI_WEBSITE_ID;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const config = await loadDeployConfig();
  const id = config.umamiWebsiteId;
  return typeof id === "string" && id.trim() ? id.trim() : "";
}

/** Site URL for og:url: from env SITE_URL, or deploy config. */
async function loadSiteUrl() {
  const fromEnv = process.env.SITE_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const config = await loadDeployConfig();
  const url = config.siteUrl;
  return typeof url === "string" && url.trim() ? url.trim() : "";
}

/** Formatted "Data refreshed on …" snippet from deploy config dataRefreshedOn (YYYY-MM-DD), or empty string. */
async function loadDataRefreshSnippet() {
  const config = await loadDeployConfig();
  const raw = config.dataRefreshedOn;
  if (typeof raw !== "string" || !raw.trim()) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return "";
  const [, y, m, dStr] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(dStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
    return "";
  const formatted = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return ` <span id="data-refresh">Data refreshed on ${formatted}.</span>`;
}

function umamiSnippet(websiteId) {
  return `  <script defer src="https://cloud.umami.is/script.js" data-website-id="${websiteId}"></script>
`;
}

function minifyJson(content) {
  return JSON.stringify(JSON.parse(content));
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

  // 2. Minify and write CSS (using minify package)
  const cssPath = path.join(VIZ, "style.css");
  const cssMinified = await minifyPkg(cssPath);
  await fs.writeFile(path.join(DIST, "style.css"), cssMinified);

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

  // 4. HTML: inject Umami and og:url if configured, then minify (minify package expects a path, so use temp file)
  let html = await fs.readFile(path.join(VIZ, "index.html"), "utf8");
  const umamiId = await loadUmamiWebsiteId();
  const umamiBlock = umamiId ? umamiSnippet(umamiId) : "";
  html = html.replace("<!-- INJECT_UMAMI -->", umamiBlock);
  const siteUrl = await loadSiteUrl();
  const ogUrlMeta = siteUrl
    ? `  <meta property="og:url" content="${siteUrl}">\n  `
    : "";
  html = html.replace("<!-- INJECT_OG_URL -->", ogUrlMeta);
  const dataRefreshSnippet = await loadDataRefreshSnippet();
  const dataRefreshPlaceholder = '<span id="data-refresh"></span>';
  html = html.replace(dataRefreshPlaceholder, dataRefreshSnippet);
  const htmlTempPath = path.join(os.tmpdir(), `viz-build-html-${Date.now()}.html`);
  try {
    await fs.writeFile(htmlTempPath, html, "utf8");
    const htmlMinified = await minifyPkg(htmlTempPath);
    await fs.writeFile(path.join(DIST, "index.html"), htmlMinified);
  } finally {
    await fs.rm(htmlTempPath, { force: true });
  }

  console.log("Built dist/ (minified index.html, style.css, app.js, data/)");
  if (umamiId) console.log("  Umami: injected", umamiId);
  else console.log("  Umami: none (set config/deploy.json umamiWebsiteId or UMAMI_WEBSITE_ID)");
  if (siteUrl) console.log("  og:url:", siteUrl);
  else console.log("  og:url: none (set config/deploy.json siteUrl or SITE_URL)");
  if (dataRefreshSnippet) console.log("  Data refresh: injected");
  else console.log("  Data refresh: none (set config/deploy.json dataRefreshedOn or run pipeline without --skip-download)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
