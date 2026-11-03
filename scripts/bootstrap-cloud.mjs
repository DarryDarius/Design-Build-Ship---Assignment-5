import { spawn } from "node:child_process";
import {
  readFile,
  appendFile,
  mkdir,
  writeFile,
  unlink,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";

const project = "qhoubpcpelxruxnbgead";
const redact = (text) =>
  text
    .replace(/(?:sk_(?:test|live)_|sb_secret_)[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted]",
    );
async function command(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["-y", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("error", reject);
    p.on("close", (code) =>
      code ? reject(new Error(redact(err + out))) : resolve(out),
    );
    p.stdin.end(input ?? "");
  });
}
const keyList = JSON.parse(
  await command([
    "supabase@latest",
    "projects",
    "api-keys",
    `--remote=${project}`,
    "--output",
    "json",
  ]),
);
const publicKey =
  keyList.find((k) => k.type === "publishable")?.api_key ??
  keyList.find((k) => k.name === "anon")?.api_key;
if (!publicKey) throw new Error("Expected a publishable key; values omitted.");
const supabaseUrl = `https://${project}.supabase.co`;

if (process.argv.includes("--hosting")) {
  const raw = await command(["clerk@latest", "env", "pull", "--print"]);
  const clerkVars = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) =>
        /^(?:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY)=/.test(line),
      )
      .map((line) => {
        const at = line.indexOf("=");
        return [
          line.slice(0, at),
          line.slice(at + 1).replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
  if (
    !clerkVars.CLERK_SECRET_KEY ||
    !clerkVars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )
    throw new Error(
      "Clerk CLI did not provide the linked app keys; values omitted.",
    );
  const values = {
    ...clerkVars,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/",
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/",
  };
  await appendFile(
    ".env.local",
    `\n# Dockside public database configuration\nNEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`,
  );
  for (const [name, value] of Object.entries(values)) {
    await command(
      [
        "vercel@latest",
        "env",
        "add",
        name,
        "--environment",
        "production,preview",
        "--force",
        "--yes",
        name.startsWith("NEXT_PUBLIC_") ? "--no-sensitive" : "--sensitive",
      ],
      value + "\n",
    );
    console.log(`Configured ${name} on Vercel (value omitted).`);
  }
}
if (process.argv.includes("--worker")) {
  await mkdir(".local-secrets", { recursive: true, mode: 0o700 });
  let workerToken;
  try {
    workerToken = (
      await readFile(".local-secrets/worker-token", "utf8")
    ).trim();
  } catch {
    workerToken = randomBytes(32).toString("base64url");
    await writeFile(".local-secrets/worker-token", workerToken, {
      mode: 0o600,
    });
  }
  const envPath = ".local-secrets/worker.env";
  await writeFile(envPath, `DOCKSIDE_CRON_TOKEN=${workerToken}\n`, {
    mode: 0o600,
  });
  try {
    await command([
      "supabase@latest",
      "secrets",
      "set",
      `--remote=${project}`,
      "--env-file",
      envPath,
      "--yes",
    ]);
  } finally {
    await unlink(envPath);
  }
  const headers = {
    "x-dockside-token": workerToken,
    "Content-Type": "application/json",
  };
  const response = await fetch(`${supabaseUrl}/functions/v1/dockside-poll`, {
    method: "POST",
    headers,
    body: "{}",
    signal: AbortSignal.timeout(40000),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `Worker returned HTTP ${response.status}; response omitted.`,
    );
  }
  console.log("Manual worker run:", JSON.stringify(result));
  if (!response.ok)
    throw new Error("Worker verification failed before scheduling.");
  const second = await fetch(`${supabaseUrl}/functions/v1/dockside-poll`, {
    method: "POST",
    headers,
    body: "{}",
    signal: AbortSignal.timeout(40000),
  });
  console.log("Immediate repeat run:", JSON.stringify(await second.json()));
  if (!second.ok) throw new Error("Repeat run failed.");
  const unauthorized = await fetch(
    `${supabaseUrl}/functions/v1/dockside-poll`,
    {
      method: "POST",
      headers: { apikey: publicKey },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    },
  );
  console.log(`Public worker invocation rejected: ${unauthorized.status}`);
  if (unauthorized.status !== 401)
    throw new Error("Worker authentication test failed.");
  const sql = (
    await readFile("supabase/setup/schedule.sql", "utf8")
  ).replaceAll("__WORKER_TOKEN__", workerToken);
  const sqlPath = ".local-secrets/schedule.sql";
  await writeFile(sqlPath, sql, { mode: 0o600 });
  try {
    await command([
      "supabase@latest",
      "db",
      "query",
      `--remote=${project}`,
      "--file",
      sqlPath,
      "--yes",
      "--output",
      "json",
    ]);
  } finally {
    await unlink(sqlPath);
  }
  console.log(
    "Scheduled Dockside every 60 seconds; credential stored in Supabase Vault.",
  );
}
