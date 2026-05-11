import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const minPython = [3, 11];
const venvDir = resolve(".venv");
const venvPython = resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const skillsRefBin = resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/skills-ref.exe" : "bin/skills-ref",
);
const requirementsFile = existsSync(resolve("requirements-dev.lock"))
  ? resolve("requirements-dev.lock")
  : resolve("requirements-dev.txt");
const stampFile = resolve(".venv", ".skills-ref-requirements.sha256");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runText(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error || result.status !== 0) return null;

  return result.stdout.trim();
}

function pythonVersion(command) {
  const output = runText(command, [
    "-c",
    "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
  ]);

  if (!output) return null;

  const version = output.split(".").map((part) => Number(part));
  if (version.length < 2 || version.some((part) => Number.isNaN(part))) {
    return null;
  }

  return version;
}

function isSupportedPython(command) {
  const version = pythonVersion(command);
  if (!version) return false;

  return (
    version[0] > minPython[0] ||
    (version[0] === minPython[0] && version[1] >= minPython[1])
  );
}

function findPython() {
  const candidates = [
    process.env.PYTHON,
    "python3.12",
    "python3.11",
    "python3",
    "python",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isSupportedPython(candidate)) return candidate;
  }

  console.error(
    "Could not find Python 3.11+. Set PYTHON=/path/to/python and rerun `pnpm setup:skills-ref`.",
  );
  process.exit(1);
}

function requirementsHash() {
  return createHash("sha256")
    .update(readFileSync(requirementsFile))
    .digest("hex");
}

if (!existsSync(venvDir)) {
  run(findPython(), ["-m", "venv", venvDir]);
}

if (!existsSync(venvPython)) {
  console.error(
    `Found ${venvDir}, but not its Python executable. Remove .venv and rerun \`pnpm setup:skills-ref\`.`,
  );
  process.exit(1);
}

if (!isSupportedPython(venvPython)) {
  const version = pythonVersion(venvPython)?.join(".") || "unknown";
  console.error(
    `.venv uses Python ${version}; Python 3.11+ is required. Remove .venv and rerun \`pnpm setup:skills-ref\`.`,
  );
  process.exit(1);
}

const hash = requirementsHash();
const previousHash = existsSync(stampFile)
  ? readFileSync(stampFile, "utf8").trim()
  : null;

if (existsSync(skillsRefBin) && previousHash === hash) {
  console.log(`skills-ref is ready at ${skillsRefBin}`);
  process.exit(0);
}

run(venvPython, [
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "-r",
  requirementsFile,
]);

if (!existsSync(skillsRefBin)) {
  console.error(
    "Installed requirements, but the local skills-ref executable was not found.",
  );
  process.exit(1);
}

writeFileSync(stampFile, `${hash}\n`);
console.log(`skills-ref is ready at ${skillsRefBin}`);
