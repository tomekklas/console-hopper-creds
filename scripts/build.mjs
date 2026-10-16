// Build the Chrome Web Store package: a minified copy under dist/ and a zip
// at the repo root. Load dist/ unpacked for development too, or the repo
// root after `npm run build` has produced content.js / options.js there?
// No: the repo root is not loadable as-is (content.js is bundled). Use dist/.
//
// Usage: npm run build

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const TARGET = ["chrome110"];
const STATIC = [
  "manifest.json",
  "options.html",
  "managed_schema.json",
  "icons",
];

function readManifest() {
  try {
    return JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  } catch (err) {
    console.error("error: manifest.json is not valid JSON —", err.message);
    process.exit(1);
  }
}

async function main() {
  const manifest = readManifest();
  const out = `${manifest.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.zip`;
  console.log(`building ${manifest.name} v${manifest.version} → ${out}`);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  const common = {
    bundle: true,
    target: TARGET,
    minify: true,
    legalComments: "none",
    pure: ["console.info"],
  };
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/content/index.js")],
    format: "iife",
    outfile: join(dist, "content.js"),
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/options/index.js")],
    format: "iife",
    outfile: join(dist, "options.js"),
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "background.js")],
    format: "esm",
    outfile: join(dist, "background.js"),
  });

  for (const f of STATIC)
    cpSync(join(root, f), join(dist, f), { recursive: true });

  rmSync(join(root, out), { force: true });
  execFileSync("zip", ["-qr", "-X", join(root, out), "."], {
    cwd: dist,
    stdio: "inherit",
  });

  const list = (dir, prefix = "") =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory()
        ? list(p, `${prefix}${f}/`)
        : [`${prefix}${f}`];
    });
  console.log(list(dist).join("\n"));
  console.log(`\n${out}: ${statSync(join(root, out)).size} bytes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
