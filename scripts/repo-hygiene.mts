import { execFileSync } from "node:child_process";

type StagedPath = {
  path: string;
  status: string;
};

const blockedPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.env($|\.local$)/, reason: "local environment files must not be staged" },
  { pattern: /^\.next\//, reason: "Next build output must not be staged" },
  { pattern: /^qa-screenshots\//, reason: "generated QA screenshots must not be staged" },
  { pattern: /^data\/flowvia-sms-store.*\.json$/, reason: "local SMS store data must not be staged" },
  { pattern: /^\.flowvia-sms-store.*\.json$/, reason: "local SMS store data must not be staged" },
  { pattern: /^tsconfig\.tsbuildinfo$/, reason: "TypeScript incremental build metadata must not be staged as content" },
];

function stagedPaths(): StagedPath[] {
  const output = execFileSync("git", ["diff", "--cached", "--name-status"], { encoding: "utf8" }).trim();
  if (!output) return [];

  return output.split("\n").map((line) => {
    const [status, ...pathParts] = line.split("\t");
    return {
      path: pathParts[pathParts.length - 1] || "",
      status,
    };
  });
}

const violations = stagedPaths().filter((item) => {
  const blocked = blockedPatterns.find(({ pattern }) => pattern.test(item.path));
  if (!blocked) return false;
  return item.status !== "D";
});

if (violations.length > 0) {
  console.error("Repository hygiene failed. Remove these generated/local artifacts from the staged diff:");
  for (const violation of violations) {
    const reason = blockedPatterns.find(({ pattern }) => pattern.test(violation.path))?.reason || "blocked artifact";
    console.error(`- ${violation.path}: ${reason}`);
  }
  process.exit(1);
}

console.log("Repository hygiene passed: no blocked generated/local artifacts staged.");
