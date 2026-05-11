import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const skillsRoot = resolve("skills");
const localSkillsRef = resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/skills-ref.exe" : "bin/skills-ref",
);
const skillsRefCommand = existsSync(localSkillsRef)
  ? localSkillsRef
  : "skills-ref";

if (!existsSync(skillsRoot)) {
  console.error("Could not find ./skills.");
  process.exit(1);
}

const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(skillsRoot, entry.name, "SKILL.md")),
  )
  .map((entry) => join(skillsRoot, entry.name))
  .sort();

if (skillDirs.length === 0) {
  console.log(
    "No skill directories containing SKILL.md were found in ./skills.",
  );
  process.exit(0);
}

let hasFailures = false;

for (const skillDir of skillDirs) {
  console.log(`\nValidating ${skillDir}`);

  const result = spawnSync(skillsRefCommand, ["validate", skillDir], {
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error(
        "skills-ref was not found. Run `pnpm setup:skills-ref` to install the local dev tool, then rerun `pnpm validate:skills`.",
      );
    } else {
      console.error(result.error.message);
    }

    process.exit(1);
  }

  if (result.status !== 0) {
    hasFailures = true;
  }
}

process.exit(hasFailures ? 1 : 0);
