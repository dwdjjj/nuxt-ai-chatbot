import { ref } from "vue";

export type Role = "user" | "assistant" | "system";
export interface ChatMessage {
  role: Role;
  content: string;
}

export function useChat(opts?: {
  model?: string;
  temperature?: number;
  maxHistory?: number;
  systemPrompt?: string;
}) {
  const messages = ref<ChatMessage[]>([]);
  const pending = ref(false);
  const error = ref<string | null>(null);

  if (opts?.systemPrompt) {
    messages.value.push({ role: "system", content: opts.systemPrompt });
  }

  async function send(prompt: string) {
    if (!prompt.trim() || pending.value) return;
    error.value = null;
    pending.value = true;

    // history: system 제외하고 직전 n개만 보냄
    const hist = messages.value.filter((m) => m.role !== "system");
    const maxHistory = opts?.maxHistory ?? 10;
    const tail = hist.slice(-maxHistory);

    messages.value.push({ role: "user", content: prompt });

    try {
      const { data, error: fetchErr } = await $fetch<
        { answer: string } | { error: string }
      >("/api/chat", {
        method: "POST",
        body: {
          prompt,
          history: tail,
          model: opts?.model,
          temperature: opts?.temperature,
        },
      })
        .then((d) => ({ data: d as any, error: null }))
        .catch((e) => ({ data: null, error: e }));

      if (fetchErr) throw fetchErr;
      if ((data as any)?.error) throw new Error((data as any).error);

      const answer = (data as any).answer as string;
      messages.value.push({ role: "assistant", content: answer });
    } catch (e: any) {
      error.value = e?.message ?? "Unknown error";
      console.error("API 호출 중 오류 발생:", e);
      // 실패 시 마지막 user 메시지 롤백 원하면 여기서 처리
    } finally {
      pending.value = false;
    }
  }

  function reset() {
    messages.value = opts?.systemPrompt
      ? [{ role: "system", content: opts.systemPrompt }]
      : [];
    error.value = null;
  }

  return { messages, pending, error, send, reset };
}
