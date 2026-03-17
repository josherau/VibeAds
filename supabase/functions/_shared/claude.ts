import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0";

export const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

export async function askClaude(systemPrompt: string, userPrompt: string) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
