import { defineEventHandler, readBody } from "h3";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { prompt, history, temperature, model } = await readBody<{
    prompt: string;
    history?: ChatMessage[];
    temperature?: number;
    model?: string;
  }>(event);

  if (!config.openaiApiKey) {
    event.node.res.statusCode = 500;
    return { error: "Server missing OPENAI_API_KEY" };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    ...(history || []),
    { role: "user", content: prompt },
  ];

  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || config.openaiModel,
      temperature: temperature ?? 0.4,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    event.node.res.statusCode = 500;
    return { error: `OpenAI error: ${err}` };
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content ?? "";
  return { answer };
});
