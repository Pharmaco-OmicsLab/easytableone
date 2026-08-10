import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "scripts", "vitest-projects.json");
const projects = JSON.parse(fs.readFileSync(configPath, "utf8"));

const toPosix = (value) => value.split(path.sep).join("/");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(toPosix(path.relative(root, fullPath)));
    }
  }
  return files;
}

function isSpecFile(file) {
  return /(^|\/)(src|tests)\//.test(`/${file}`) && /\.test\.tsx?$/.test(file);
}

function isE2eFile(file) {
  return file.startsWith("tests/e2e/");
}

const unitIncludePatterns = new Set(projects.unit.include);
const pyodideFiles = new Set(projects.pyodide.include);
const allSpecs = walk(root).filter((file) => isSpecFile(file) && !isE2eFile(file)).sort();

const stalePyodideFiles = [...pyodideFiles].filter((file) => !allSpecs.includes(file));
const duplicatePyodideFiles = projects.pyodide.include.filter(
  (file, index, files) => files.indexOf(file) !== index,
);

function matchesUnitInclude(file) {
  if (file.startsWith("src/") && file.endsWith(".test.ts")) return unitIncludePatterns.has("src/**/*.test.ts");
  if (file.startsWith("src/") && file.endsWith(".test.tsx")) return unitIncludePatterns.has("src/**/*.test.tsx");
  if (file.startsWith("tests/") && file.endsWith(".test.ts")) return unitIncludePatterns.has("tests/**/*.test.ts");
  if (file.startsWith("tests/") && file.endsWith(".test.tsx")) return unitIncludePatterns.has("tests/**/*.test.tsx");
  return false;
}

function inUnitProject(file) {
  return matchesUnitInclude(file) && !pyodideFiles.has(file) && !isE2eFile(file);
}

function inPyodideProject(file) {
  return pyodideFiles.has(file);
}

const gaps = [];
const overlaps = [];
const pyodideFilesWithMocks = [];
const unitFilesWithUnmockedRealCalls = [];

function reads(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function mocksPyodideClient(source) {
  return /vi\.mock\(\s*["'][^"']*pyodide\.client["']/.test(source);
}

function callsRealPyodideClient(source) {
  return /pyodideClient\.(?:call|isReady|runPython)\s*\(/.test(source);
}

for (const file of allSpecs) {
  const memberships = [inUnitProject(file), inPyodideProject(file)].filter(Boolean).length;
  if (memberships === 0) gaps.push(file);
  if (memberships > 1) overlaps.push(file);

  const source = reads(file);
  if (inPyodideProject(file) && mocksPyodideClient(source)) {
    pyodideFilesWithMocks.push(file);
  }
  if (inUnitProject(file) && callsRealPyodideClient(source) && !mocksPyodideClient(source)) {
    unitFilesWithUnmockedRealCalls.push(file);
  }
}

if (
  stalePyodideFiles.length ||
  duplicatePyodideFiles.length ||
  gaps.length ||
  overlaps.length ||
  pyodideFilesWithMocks.length ||
  unitFilesWithUnmockedRealCalls.length
) {
  console.error("Vitest project membership check failed.");
  if (stalePyodideFiles.length) {
    console.error("\nStale pyodide entries:");
    for (const file of stalePyodideFiles) console.error(`  ${file}`);
  }
  if (duplicatePyodideFiles.length) {
    console.error("\nDuplicate pyodide entries:");
    for (const file of duplicatePyodideFiles) console.error(`  ${file}`);
  }
  if (gaps.length) {
    console.error("\nSpecs in neither project:");
    for (const file of gaps) console.error(`  ${file}`);
  }
  if (overlaps.length) {
    console.error("\nSpecs in both projects:");
    for (const file of overlaps) console.error(`  ${file}`);
  }
  if (pyodideFilesWithMocks.length) {
    console.error("\nPyodide project specs that mock pyodide.client:");
    for (const file of pyodideFilesWithMocks) console.error(`  ${file}`);
  }
  if (unitFilesWithUnmockedRealCalls.length) {
    console.error("\nUnit project specs with unmocked real pyodideClient calls:");
    for (const file of unitFilesWithUnmockedRealCalls) console.error(`  ${file}`);
  }
  process.exit(1);
}

const unitCount = allSpecs.filter(inUnitProject).length;
const pyodideCount = allSpecs.filter(inPyodideProject).length;
console.log(`Vitest project membership OK: ${unitCount} unit specs, ${pyodideCount} pyodide specs.`);
