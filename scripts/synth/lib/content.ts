import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, requireEnv } from "./config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}

export interface TicketContext {
  userName: string;
  userFirstName: string;
  persona: string;
  plan: string;
  status: string;
  city: string;
  primarySport: string;
  recentActivityTitle?: string;
  recentActivityDate?: string;
}

export interface GeneratedMessage {
  title: string;
  body: string;
}

const BASE_SYSTEM = `You write realistic customer support messages FROM the user's perspective to Stride, a Strava-like fitness tracking product.

Voice:
- First person, casual, as if typing into a support form
- 2-5 sentences in the body, natural typos ok occasionally (not overdone)
- Title is 4-10 words, specific, not generic
- Frustration level matches the scenario; churned users are more heated, new users more confused
- Never use the word "Stride" awkwardly; reference the app/site/watch naturally

Return JSON ONLY in this exact shape, nothing else, no code fences, no commentary:
{"title":"...","body":"..."}`;

function scenarioSystemPrompt(scenarioInstructions: string): string {
  return `${BASE_SYSTEM}

SCENARIO:
${scenarioInstructions}`;
}

function userPrompt(ctx: TicketContext): string {
  const lines = [
    `User: ${ctx.userName} (${ctx.userFirstName})`,
    `Persona: ${ctx.persona}`,
    `Plan: ${ctx.plan}`,
    `Status: ${ctx.status}`,
    `City: ${ctx.city}`,
    `Primary sport: ${ctx.primarySport}`,
  ];
  if (ctx.recentActivityTitle) lines.push(`Recent activity: "${ctx.recentActivityTitle}" on ${ctx.recentActivityDate ?? "recently"}`);
  lines.push("", "Write the support message now.");
  return lines.join("\n");
}

function parseJson(raw: string): GeneratedMessage {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error(`No JSON in response: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(text.slice(first, last + 1));
  if (typeof parsed.title !== "string" || typeof parsed.body !== "string") {
    throw new Error(`Malformed JSON: ${raw.slice(0, 120)}`);
  }
  return { title: parsed.title.trim(), body: parsed.body.trim() };
}

export async function generateTicketMessage(
  scenarioInstructions: string,
  ctx: TicketContext,
): Promise<GeneratedMessage> {
  const c = getClient();
  const response = await c.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: [
      {
        type: "text",
        text: scenarioSystemPrompt(scenarioInstructions),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response from Claude");
  return parseJson(block.text);
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function probeAnthropicConfig(): void {
  loadEnv();
  requireEnv("ANTHROPIC_API_KEY");
}
