import { loadEnv } from "./lib/config.js";

type CheckResult = {
  service: string;
  ok: boolean;
  detail: string;
};

function bearer(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

async function checkIntercom(token: string | undefined): Promise<CheckResult> {
  if (!token) return { service: "intercom", ok: false, detail: "INTERCOM_ACCESS_TOKEN not set" };
  try {
    const res = await fetch("https://api.intercom.io/me", {
      headers: { ...bearer(token), "Intercom-Version": "2.11" },
    });
    if (!res.ok) return { service: "intercom", ok: false, detail: `HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}` };
    const body = (await res.json()) as { app?: { name?: string; id_code?: string }; name?: string };
    const app = body.app?.name ?? body.app?.id_code ?? "unknown workspace";
    return { service: "intercom", ok: true, detail: `authenticated against workspace "${app}"` };
  } catch (err) {
    return { service: "intercom", ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkPosthog(token: string | undefined, host: string): Promise<CheckResult> {
  if (!token) return { service: "posthog", ok: false, detail: "POSTHOG_PERSONAL_API_KEY not set" };
  if (!token.startsWith("phx_")) {
    return {
      service: "posthog",
      ok: false,
      detail: `token does not start with "phx_" — make sure this is a Personal API key, not the Project API key (phc_)`,
    };
  }
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/users/@me/`, { headers: bearer(token) });
    if (!res.ok) return { service: "posthog", ok: false, detail: `HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}` };
    const body = (await res.json()) as { email?: string; first_name?: string };
    return {
      service: "posthog",
      ok: true,
      detail: `authenticated as ${body.email ?? body.first_name ?? "unknown user"}`,
    };
  } catch (err) {
    return { service: "posthog", ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkLinear(token: string | undefined): Promise<CheckResult> {
  if (!token) return { service: "linear", ok: false, detail: "LINEAR_API_KEY not set" };
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: token.startsWith("lin_") ? token : `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: `query { viewer { email name } }` }),
    });
    if (!res.ok) return { service: "linear", ok: false, detail: `HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}` };
    const body = (await res.json()) as { data?: { viewer?: { email?: string; name?: string } }; errors?: { message: string }[] };
    if (body.errors?.length) return { service: "linear", ok: false, detail: body.errors.map((e) => e.message).join("; ") };
    const v = body.data?.viewer;
    return {
      service: "linear",
      ok: true,
      detail: `authenticated as ${v?.email ?? v?.name ?? "unknown user"}`,
    };
  } catch (err) {
    return { service: "linear", ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const env = loadEnv();

  const results = await Promise.all([
    checkIntercom(env.INTERCOM_ACCESS_TOKEN),
    checkPosthog(
      process.env.POSTHOG_PERSONAL_API_KEY ?? env.POSTHOG_API_KEY,
      env.VITE_PUBLIC_POSTHOG_HOST,
    ),
    checkLinear(env.LINEAR_API_KEY),
  ]);

  let allOk = true;
  for (const r of results) {
    const badge = r.ok ? "✓" : "✗";
    console.log(`${badge} ${r.service.padEnd(10)} ${r.detail}`);
    if (!r.ok) allOk = false;
  }

  if (!allOk) {
    console.log("\nOne or more keys failed. See the troubleshooting section in docs/mcp-setup.md.");
    process.exit(1);
  }
  console.log("\nAll keys verified. Safe to proceed to Claude Code MCP setup.");
}

main();
