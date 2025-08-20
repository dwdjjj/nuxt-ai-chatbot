import { defineEventHandler, readBody, setHeader } from "h3";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { prompt, history, temperature, model, stream } = await readBody<{
    prompt: string;
    history?: ChatMessage[];
    temperature?: number;
    model?: string;
    stream?: boolean;
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

  // 공통 payload
  const payload: any = {
    model: model || config.openaiModel,
    temperature: temperature ?? 0.4,
    messages,
    stream: !!stream, // ← 업스트림에도 스트리밍 전달
  };

  // 업스트림 호출
  const upstream = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => "");
    event.node.res.statusCode = 500;
    return { error: `OpenAI error: ${err}` };
  }

  // 스트리밍 OFF: 기존 방식
  if (!stream) {
    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content ?? "";
    return { answer };
  }

  // === 스트리밍 ON: SSE로 프록시 ===
  // 클라이언트에 SSE 헤더 세팅
  setHeader(event, "Content-Type", "text/event-stream; charset=utf-8");
  setHeader(event, "Cache-Control", "no-cache, no-transform");
  setHeader(event, "Connection", "keep-alive");
  // CORS(필요 시)
  // setHeader(event, "Access-Control-Allow-Origin", "*");

  const res = event.node.res;

  // 초기 keep-alive ping(선택)
  res.write(`: ping\n\n`);

  // 업스트림의 content-type 파악
  const upstreamCT = upstream.headers.get("content-type")?.toLowerCase() || "";

  // 1) 업스트림이 이미 SSE면 그대로 raw 파이프
  if (upstreamCT.includes("text/event-stream")) {
    if (!upstream.body) {
      res.end();
      return null;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // node res.write는 Buffer/Uint8Array 수용
      res.write(value);
    }
    res.end();
    return null;
  }

  // 2) 일반 텍스트/바이트 스트림이면 우리가 SSE로 감싸서 전달
  if (!upstream.body) {
    res.end();
    return null;
  }

  if (upstreamCT.includes("application/json")) {
    // ❗️업스트림이 스트리밍을 안 주고 JSON 한 방으로 준 경우
    const text = await upstream.text();
    let answer = "";
    try {
      const data = JSON.parse(text);
      // OpenAI 호환 응답에서 내용 추출
      answer = data?.choices?.[0]?.message?.content ?? "";
    } catch {
      // 혹시 JSON 파싱 실패 시, 원문 그대로 보냄
      answer = text;
    }
    // 프론트 파서가 잡을 수 있도록 content 필드로 보냄
    res.write(`data: ${JSON.stringify({ content: answer })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return null;
  }

  // 그 외 텍스트 스트림: 우리가 SSE로 감싸서 라인별 전송
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    chunk
      .split(/\r?\n/)
      .filter((ln) => ln.length > 0)
      .forEach((ln) => {
        res.write(`data: ${ln}\n\n`);
      });
  }
  res.write("data: [DONE]\n\n");
  res.end();
  return null;
});
