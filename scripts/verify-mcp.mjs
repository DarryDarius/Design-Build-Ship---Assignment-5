// Direct protocol verification only: no model turn or delegated agent is run.
// --complete-setup republishes the reviewed existing worker and its same schedule.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
const project = "qhoubpcpelxruxnbgead";
const server = "supabase_dockside";
const url = `https://mcp.supabase.com/mcp?project_ref=${project}`;
const args = [
  "-c",
  `mcp_servers.${server}.url=${JSON.stringify(url)}`,
  "app-server",
  "--stdio",
];
const child = spawn("codex", args, {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});
const lines = createInterface({ input: child.stdout });
const pending = new Map();
let counter = 0;
let diagnostics = "";
child.stderr.on("data", (chunk) => {
  diagnostics = (diagnostics + chunk.toString()).slice(-6000);
});
function request(method, params) {
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}
lines.on("line", (line) => {
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    return;
  }
  if (r.id !== undefined && !r.method && pending.has(r.id)) {
    const p = pending.get(r.id);
    pending.delete(r.id);
    clearTimeout(p.timer);
    if (r.error) p.reject(new Error(r.error.message));
    else p.resolve(r.result);
  } else if (r.id !== undefined && r.method) {
    // Only explicitly requested operations below are allowed; deny extra requests.
    child.stdin.write(
      JSON.stringify({
        id: r.id,
        error: {
          code: -32601,
          message: "Unsupported request in bounded verifier",
        },
      }) + "\n",
    );
  }
});
child.on("exit", () => {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(
      new Error(
        "Protocol process exited: " +
          diagnostics
            .replace(/(?:sk_|sbp_|sb_secret_)[A-Za-z0-9_-]+/g, "[redacted]")
            .slice(-1800),
      ),
    );
  }
  pending.clear();
});
try {
  await request("initialize", {
    clientInfo: { name: "dockside_mcp_verifier", version: "1.0.0" },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(
    JSON.stringify({ method: "initialized", params: {} }) + "\n",
  );
  const started = await request("thread/start", {
    cwd: process.cwd(),
    ephemeral: true,
    approvalPolicy: "never",
    sandbox: "read-only",
  });
  const threadId = started.thread.id;
  const inventory = await request("mcpServerStatus/list", {
    threadId,
    serverName: server,
    detail: "toolsAndAuthOnly",
  });
  const status = inventory.data.find((item) => item.name === server);
  if (!status) throw new Error("Scoped MCP server missing from inventory");
  const sql = Object.values(status.tools).find((tool) =>
    tool.name.endsWith("execute_sql"),
  );
  if (!sql) throw new Error("MCP SQL tool not available");
  if (process.argv.includes("--describe"))
    console.log(
      JSON.stringify(
        Object.values(status.tools).filter((tool) =>
          [
            "deploy_edge_function",
            "execute_sql",
            "list_edge_functions",
          ].includes(tool.name),
        ),
        null,
        2,
      ),
    );
  const properties = sql.inputSchema.properties ?? {};
  const toolArgs = {
    query:
      "select (select count(*) from public.dockside_stations) as stations, (select count(*) from public.dockside_station_status) as statuses, (select active from cron.job where jobname='dockside-poll') as cron_active;",
  };
  if (properties.project_id) toolArgs.project_id = project;
  const result = await request("mcpServer/tool/call", {
    threadId,
    server,
    tool: sql.name,
    arguments: toolArgs,
  });
  const output = JSON.stringify(result);
  if (
    result.isError ||
    !/stations[\\\"]*\s*:\s*40/.test(output) ||
    !/statuses[\\\"]*\s*:\s*40/.test(output) ||
    !/cron_active[\\\"]*\s*:\s*true/.test(output)
  ) {
    console.log(JSON.stringify({ tool: sql.name, result }));
    throw new Error(
      "MCP query did not verify the expected station counts and active cron",
    );
  }
  const proof = {
    verified_at: new Date().toISOString(),
    transport: "Supabase Streamable HTTP MCP via Codex protocol client",
    project_ref: project,
    scoped_url: url,
    tool: sql.name,
    stations: 40,
    statuses: 40,
    cron_active: true,
    model_turns_started: 0,
    credentials_logged: false,
  };
  if (process.argv.includes("--complete-setup")) {
    const deploy = Object.values(status.tools).find(
      (tool) => tool.name === "deploy_edge_function",
    );
    if (!deploy) throw new Error("MCP function deployment tool missing");
    const names = [
      "supabase/functions/dockside-poll/index.ts",
      "supabase/functions/_shared/normalize.ts",
      "src/data/stations.json",
    ];
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        content: await readFile(name, "utf8"),
      })),
    );
    const deployed = await request("mcpServer/tool/call", {
      threadId,
      server,
      tool: deploy.name,
      arguments: {
        name: "dockside-poll",
        entrypoint_path: names[0],
        verify_jwt: false,
        files,
      },
    });
    if (deployed.isError)
      throw new Error("MCP deployment failed: " + JSON.stringify(deployed));
    console.log("Reviewed worker republished through MCP.");
    const scheduleArgs = {
      query:
        "select cron.schedule('dockside-poll','* * * * *',(select command from cron.job where jobname='dockside-poll')) as job_id;",
    };
    if (properties.project_id) scheduleArgs.project_id = project;
    const scheduled = await request("mcpServer/tool/call", {
      threadId,
      server,
      tool: sql.name,
      arguments: scheduleArgs,
    });
    if (scheduled.isError) throw new Error("MCP schedule confirmation failed");
    console.log("Same named minute schedule applied through MCP.");
    const checked = await request("mcpServer/tool/call", {
      threadId,
      server,
      tool: sql.name,
      arguments: toolArgs,
    });
    if (
      checked.isError ||
      !/cron_active[\\\"]*\s*:\s*true/.test(JSON.stringify(checked))
    )
      throw new Error("Post-setup MCP query did not confirm active cron");
    Object.assign(proof, {
      worker_deployed_via_mcp: true,
      worker_name: "dockside-poll",
      cron_set_via_mcp: true,
      cron_schedule: "* * * * *",
    });
  }
  if (process.argv.includes("--complete-setup")) {
    await writeFile(
      "docs/mcp-setup-verification.json",
      JSON.stringify(proof, null, 2) + "\n",
    );
  }
  await writeFile(
    "docs/mcp-verification.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  child.stdin.end();
  child.kill("SIGTERM");
  lines.close();
}
