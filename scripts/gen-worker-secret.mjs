// Generates a random session-signing secret at build time and writes it into
// worker/secret.generated.ts. This runs as an npm `prebuild` step, so every
// Cloudflare build bakes a fresh secret into the Worker bundle — which is
// server-side only (never sent to browsers) and never committed to git.
//
// Tradeoff: the secret rotates each deploy, so existing sessions are
// invalidated on deploy and users sign in again. Fine for this project, and it
// removes the fragile "set a dashboard Secret" step entirely. If a stable
// SESSION_SECRET is set on the Worker, the code prefers that instead.

import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "worker", "secret.generated.ts");
const secret = randomBytes(32).toString("hex");

writeFileSync(
  out,
  `// AUTO-GENERATED at build time by scripts/gen-worker-secret.mjs. Do not edit.\n` +
    `export const BUILD_SECRET = "${secret}";\n`,
);

console.log(`[gen-worker-secret] wrote worker/secret.generated.ts (${secret.length}-char secret)`);
