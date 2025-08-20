import { ref } from "vue";

export type Role = "user" | "assistant" | "system";
export interface ChatMessage {
  role: Role;
  content: string;
}

export interface UseChatOptions {
  model?: string;
  temperature?: number;
  maxHistory?: number;
  systemPrompt?: string;
  maxTokens?: number;
  stream?: boolean; // true면 스트리밍 수신
}

export function useChat(opts: UseChatOptions = {}) {
  const messages = ref<ChatMessage[]>([]);
  const pending = ref(false);
  const error = ref<string | null>(null);

  let abortCtrl: AbortController | null = null;

  if (opts.systemPrompt) {
    messages.value.push({ role: "system", content: opts.systemPrompt });
  }

  function buildHistory() {
    const hist = messages.value.filter((m) => m.role !== "system");
    const maxHistory = opts.maxHistory ?? 10;
    return hist.slice(-maxHistory);
  }

  // 불완전한 마크다운(특히 코드펜스) 보정은 "완료 시점"에만 적용
  function postProcessMarkdown(s: string) {
    let out = s ?? "";
    const fenceCount = (out.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) out += "\n```";
    if (!out.endsWith("\n")) out += "\n";
    return out;
  }

  // SSE 한 줄에서 payload 추출: "data: {...}" | "data: text"
  function parseSSELine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return null;
    const payload = trimmed.slice(5).trim(); // after "data:"
    if (!payload || payload === "[DONE]" || payload === "[done]") return "";
    // JSON({delta, content, done}) 또는 순수 텍스트 모두 지원
    try {
      const obj = JSON.parse(payload);
      return obj.delta?.content ?? obj.delta ?? obj.content ?? obj.answer ?? "";
    } catch {
      return payload; // JSON이 아니면 텍스트로 간주
    }
  }

  // 안전하게 마지막 메시지에 문자열을 덧붙임
  function appendToMessage(index: number, chunk: string) {
    const msg = messages.value[index];
    if (!msg) return; // index가 유효하지 않으면 무시
    msg.content += chunk;
  }

  async function send(prompt: string) {
    if (!prompt.trim() || pending.value) return;

    error.value = null;
    pending.value = true;

    // 이전 요청 중단
    abortCtrl?.abort();
    abortCtrl = new AbortController();

    const tail = buildHistory();
    messages.value.push({ role: "user", content: prompt });

    try {
      const wantStream = !!opts.stream;

      if (!wantStream) {
        // 비스트리밍: 한 번에 JSON
        const resp = await $fetch<{ answer?: string; error?: string }>(
          "/api/chat",
          {
            method: "POST",
            body: {
              prompt,
              history: tail,
              model: opts.model,
              temperature: opts.temperature,
              maxTokens: opts.maxTokens ?? 1536,
              stream: false,
            },
            signal: abortCtrl.signal,
          }
        );

        if (resp?.error) throw new Error(resp.error);
        const answer = postProcessMarkdown(resp?.answer ?? "");
        messages.value.push({ role: "assistant", content: answer });
        return;
      }

      // 스트리밍: fetch + ReadableStream
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history: tail,
          model: opts.model,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens ?? 1536,
          stream: true,
        }),
        signal: abortCtrl.signal,
      });

      if (!resp.ok) {
        // 서버가 JSON 에러 바디를 줄 수도 있음
        let serverMsg = "";
        try {
          serverMsg = await resp.text();
        } catch {}
        throw new Error(
          `API ${resp.status} ${resp.statusText}${
            serverMsg ? ` - ${serverMsg.substring(0, 200)}` : ""
          }`
        );
      }

      // 어시스턴트 메시지 자리 만들기 (인덱스 고정)
      messages.value.push({ role: "assistant", content: "" });
      const idx = messages.value.length - 1;

      // 본문이 없으면 스트리밍 불가 → 텍스트로 대체
      if (!resp.body) {
        const fallback = postProcessMarkdown(await resp.text());
        appendToMessage(idx, fallback);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffered += chunk;

        const ct = resp.headers.get("Content-Type")?.toLowerCase() || "";

        if (ct.includes("text/event-stream")) {
          // SSE: \n\n 단위 이벤트로 분리
          const events = buffered.split(/\r?\n\r?\n/);
          buffered = events.pop() ?? ""; // 미완성 이벤트는 버퍼에 남김
          for (const evt of events) {
            const lines = evt.split(/\r?\n/);
            for (const line of lines) {
              const add = parseSSELine(line);
              if (add === null) continue;
              if (add === "") continue; // [DONE] 또는 빈 라인
              appendToMessage(idx, add);
            }
          }
        } else {
          // 일반 텍스트 스트림
          appendToMessage(idx, chunk);
          buffered = ""; // 일반 텍스트는 버퍼 불필요
        }
      }

      // 최종 마크다운 보정
      const doneMsg = messages.value[idx];
      if (doneMsg) {
        doneMsg.content = postProcessMarkdown(doneMsg.content);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      error.value = e?.message ?? "Unknown error";
      console.error("API 호출 중 오류:", e);
    } finally {
      pending.value = false;
    }
  }

  function reset() {
    abortCtrl?.abort();
    messages.value = opts.systemPrompt
      ? [{ role: "system", content: opts.systemPrompt }]
      : [];
    error.value = null;
  }

  return { messages, pending, error, send, reset };
}
