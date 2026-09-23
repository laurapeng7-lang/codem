import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(appDirectory, "site");
const outputDirectory = path.join(appDirectory, "dist");

if (!existsSync(path.join(sourceDirectory, "index.html"))) {
  throw new Error("Missing deployable site/index.html");
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
cpSync(sourceDirectory, outputDirectory, { recursive: true });

console.log(`Copied deployable CodeM Web App assets to ${outputDirectory}`);
