const BASE_URL = "https://api.deepseek.com/v1";
const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";

export function hasDeepSeekKey(): boolean {
  return API_KEY.trim().length > 0;
}

export async function chat({
  systemPrompt,
  userMessage,
  temperature = 0.1,
  maxTokens = 4096,
}: {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  if (!hasDeepSeekKey()) throw new Error("DEEPSEEK_API_KEY is not set");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      stream: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`DeepSeek API ${response.status}`);

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response");

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`DeepSeek returned non-JSON content: ${content.slice(0, 200)}`);
  }
}
