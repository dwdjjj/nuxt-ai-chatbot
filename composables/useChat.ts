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
  stream?: boolean; // 기본 false: 완성문 한 번에 받기
}

export function useChat(opts: UseChatOptions = {}) {
  const messages = ref<ChatMessage[]>([]);
  const pending = ref(false);
  const error = ref<string | null>(null);

  // 중복 호출 대비
  let abortCtrl: AbortController | null = null;

  if (opts.systemPrompt) {
    messages.value.push({ role: "system", content: opts.systemPrompt });
  }

  function buildHistory() {
    const hist = messages.value.filter((m) => m.role !== "system");
    const maxHistory = opts.maxHistory ?? 10;
    return hist.slice(-maxHistory);
  }

  // 불완전한 마크다운(특히 코드펜스) 보정
  function postProcessMarkdown(s: string) {
    let out = s ?? "";
    const fenceCount = (out.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) out += "\n```"; // 열린 펜스 닫기
    if (!out.endsWith("\n")) out += "\n"; // 마지막 줄 개행
    return out;
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
            stream: opts.stream ?? false, // 스트리밍 끄면 미완성 렌더 방지
          },
          signal: abortCtrl.signal,
        }
      );

      if (resp?.error) throw new Error(resp.error);

      let answer = resp?.answer ?? "";
      answer = postProcessMarkdown(answer);

      // 완료 시점에만 push → 미완성 출력 방지
      messages.value.push({ role: "assistant", content: answer });
    } catch (e: any) {
      if (e?.name === "AbortError") return; // 새 요청으로 인한 중단
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
