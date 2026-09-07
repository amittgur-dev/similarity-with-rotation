// Supabase Edge Function: "describe the experiment you want".
// Holds the Anthropic API key (set with `supabase secrets set ANTHROPIC_API_KEY=...`),
// checks that the caller is a signed-in experimenter, forwards the request
// body prepared by src/describe.js (model, system, messages, output_config)
// to the Messages API and returns the response. Deploy with
// `supabase functions deploy describe --no-verify-jwt --workdir server` (run from the repository root).
import Anthropic from "npm:@anthropic-ai/sdk";

const ALLOWED_MODELS = new Set(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // the caller must hold a valid Supabase session (an experimenter)
  const auth = req.headers.get("Authorization") ?? "";
  const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  if (!who.ok) return json(401, { error: "sign in to use the AI function" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid JSON" }); }
  const model = typeof body.model === "string" && ALLOWED_MODELS.has(body.model) ? body.model : "claude-opus-5";
  if (!Array.isArray(body.messages) || !body.messages.length) return json(400, { error: "messages required" });

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: Math.min(Number(body.max_tokens) || 16000, 32000),
      system: typeof body.system === "string" ? body.system : undefined,
      messages: body.messages as Anthropic.MessageParam[],
      output_config: body.output_config as Anthropic.MessageCreateParams["output_config"],
    });
    return json(200, response);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: "rate limited — try again in a moment" });
    if (err instanceof Anthropic.AuthenticationError) return json(500, { error: "the function's ANTHROPIC_API_KEY is missing or invalid" });
    if (err instanceof Anthropic.APIError) return json(502, { error: `Claude API error ${err.status}: ${err.message}` });
    return json(500, { error: String(err) });
  }
});
