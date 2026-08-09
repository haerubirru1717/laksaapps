import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const out = join(root, "dist");
const files = [
  "index.html", "app.html", "checkout.html", "legal.html", "manifest.json", "service-worker.js",
  "banks.js", "bankColors.js", "ai-chat.js", "CNAME", "_headers", "_redirects"
];
const directories = ["css", "js", "icons", "ewallet", "Banks Logo", "logo app"];
const publicExtensions = new Set([".css", ".js", ".png", ".svg", ".webp"]);

async function copyPublicDirectory(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyPublicDirectory(sourcePath, destinationPath);
      continue;
    }
    if (!entry.isFile() || !publicExtensions.has(extname(entry.name).toLowerCase())) continue;
    await copyFile(sourcePath, destinationPath);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of files) {
  const source = join(root, name);
  try {
    await stat(source);
    await copyFile(source, join(out, name));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

for (const name of directories) {
  const source = join(root, name);
  try {
    await stat(source);
    await copyPublicDirectory(source, join(out, name));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(`Production frontend created at ${relative(root, out) || "dist"}`);
