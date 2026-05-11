import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { estimateTokenCount } from "tokenx";

const skillsRoot = resolve("skills");
const warningLimit = Number(process.env.SKILL_TOKEN_WARNING_LIMIT || 5000);

function findSkillFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findSkillFiles(path));
      continue;
    }

    if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(path);
    }
  }

  return files;
}

function formatCount(count) {
  return count.toLocaleString("en-US").padStart(6);
}

if (!existsSync(skillsRoot)) {
  console.error("Could not find ./skills.");
  process.exit(1);
}

const skillFiles = findSkillFiles(skillsRoot).sort();

if (skillFiles.length === 0) {
  console.log("No SKILL.md files were found under ./skills.");
  process.exit(0);
}

console.log(
  `\nEstimated SKILL.md token usage (warning limit: ${warningLimit}):`,
);

let warningCount = 0;

for (const skillFile of skillFiles) {
  const text = readFileSync(skillFile, "utf8");
  const tokens = estimateTokenCount(text);
  const displayPath = relative(process.cwd(), skillFile);

  console.log(`${formatCount(tokens)}  ${displayPath}`);

  if (tokens > warningLimit) {
    warningCount += 1;
    console.warn(
      `Warning: ${displayPath} is ${tokens.toLocaleString("en-US")} estimated tokens, above ${warningLimit.toLocaleString("en-US")}.`,
    );
  }
}

if (warningCount > 0) {
  console.warn(
    `Token warning: ${warningCount} SKILL.md file${warningCount === 1 ? "" : "s"} above ${warningLimit.toLocaleString("en-US")} estimated tokens.`,
  );
}
