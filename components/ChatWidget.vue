<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useChat } from "../composables/useChat";

import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  html: false,
});

type Props = {
  title?: string;
  placeholder?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  maxHistory?: number;
  position?: "br" | "bl" | "tr" | "tl";
  welcomeMessage?: string;
  maxTokens?: number;
  stream?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
  title: "AI Chat",
  placeholder: "질문을 입력하세요...",
  temperature: 0.4,
  maxHistory: 10,
  position: "br",
  welcomeMessage: `안녕하세요! 무엇을 도와드릴까요?
  예시 질문:
  - "오늘 날씨 어때?"
  - "React와 Vue 차이 알려줘"
  - "코딩 테스트 연습 문제 추천해줘"`,
  maxTokens: 1536,
  stream: false, // 완성문 한 번에 표시 (끊김 완화)
});

const open = ref(false);
const input = ref("");
const expanding = ref(false);
/* 인삿말 플래그 */
const greeted = ref(false);
const scrollEl = ref<HTMLDivElement | null>(null);

/* 예시 프롬프트 (클릭해서 바로 전송) */
const quickPrompts = [
  "오늘 할 일 3가지만 정리해줘",
  "React와 Vue의 핵심 차이를 표로 비교해줘",
  "코딩 테스트용 DFS/BFS 템플릿 보여줘",
];

const { messages, pending, error, send, reset } = useChat({
  model: props.model,
  temperature: props.temperature,
  maxHistory: props.maxHistory,
  systemPrompt: props.systemPrompt,
  maxTokens: props.maxTokens,
  stream: props.stream,
});

const renderedMessages = computed(() => {
  const arr = [...messages.value];
  if (
    pending.value &&
    arr.length &&
    arr[arr.length - 1]?.role === "assistant"
  ) {
    arr.pop();
  }
  return arr;
});

function renderMD(src: string) {
  const html = md.render(src ?? "");
  return DOMPurify.sanitize(html);
}

const btnPos = computed(() => {
  const p = props.position;
  const base = "fixed z-50 m-4";
  if (p === "br") return `${base} right-4 bottom-4`;
  if (p === "bl") return `${base} left-4 bottom-4`;
  if (p === "tr") return `${base} right-4 top-4`;
  return `${base} left-4 top-4`;
});

/* 처음 열면 인삿말 */
function ensureGreeting() {
  if (greeted.value) return;
  const nonSystemCount = messages.value.filter(
    (m) => m.role !== "system"
  ).length;
  if (nonSystemCount === 0) {
    messages.value.push({
      role: "assistant",
      content: props.welcomeMessage!,
    } as any);
    greeted.value = true;
  }
}

/* 스크롤 하단 맞추기 */
async function scrollToBottom() {
  await nextTick();
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

// 코드 블록 복사
async function enhanceCodeBlocks() {
  await nextTick();
  const root = scrollEl.value;
  if (!root) return;

  root.querySelectorAll("pre").forEach((pre) => {
    if (pre.getAttribute("data-enhanced")) return;

    const codeEl = pre.querySelector("code");
    const original = (codeEl?.textContent ?? pre.textContent ?? "").trimEnd();
    pre.setAttribute("data-code-raw", original);

    pre.setAttribute("data-enhanced", "1");
    pre.style.position = "relative";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "복사";
    btn.className =
      "absolute top-2 right-2 text-xs px-2 py-1 rounded bg-black/70 text-white hover:bg-black";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = pre.getAttribute("data-code-raw") ?? original;
      try {
        await navigator.clipboard.writeText(raw);
        const prev = btn.textContent;
        btn.textContent = "복사됨!";
        setTimeout(() => (btn.textContent = prev || "복사"), 1200);
      } catch {
        const prev = btn.textContent;
        btn.textContent = "복사 실패";
        setTimeout(() => (btn.textContent = prev || "복사"), 1200);
      }
    });

    pre.appendChild(btn);
  });
}

/* pending이 끝나는 시점에만 실행 */
watch(pending, async (p) => {
  if (!p) {
    await enhanceCodeBlocks();
    await scrollToBottom();
  }
});

function toggle() {
  if (!open.value) {
    expanding.value = true;
    setTimeout(async () => {
      open.value = true;
      expanding.value = false;
      ensureGreeting();
      await scrollToBottom();
      await enhanceCodeBlocks();
    }, 300);
  } else {
    open.value = false;
  }
}

async function onSubmit() {
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  await send(q);
}

async function askQuick(prompt: string) {
  input.value = "";
  await send(prompt);
}

onMounted(enhanceCodeBlocks);
onUpdated(enhanceCodeBlocks);
</script>

<template>
  <!-- 토글 뱃지 버튼 -->
  <button
    :class="[
      btnPos,
      expanding ? 'scale-125' : '',
      'rounded-full shadow-lg p-3 bg-black text-white hover:opacity-90 transition-transform duration-300',
    ]"
    aria-label="Toggle Chat"
    @click="toggle"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class="size-6"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
      />
    </svg>
  </button>

  <!-- 패널 -->
  <transition name="fade">
    <div
      v-if="open"
      class="fixed bottom-20 right-4 w-[360px] max-h-[70vh] bg-white border shadow-xl rounded-2xl overflow-hidden flex flex-col"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <div class="font-semibold">{{ props.title }}</div>
        <div class="flex gap-2">
          <button
            class="text-sm text-gray-500 hover:text-gray-700"
            @click="reset"
          >
            초기화
          </button>
          <button class="text-gray-500 hover:text-black" @click="toggle">
            ✕
          </button>
        </div>
      </div>

      <!-- 메시지 영역 -->
      <div ref="scrollEl" class="flex-1 overflow-auto p-3 space-y-2 text-sm">
        <div v-for="(m, i) in messages" :key="i">
          <template v-if="m.role === 'system'">
            <div class="text-xs text-gray-400 italic">{{ m.content }}</div>
          </template>
          <template v-else>
            <div
              :class="[
                'px-3 py-2 rounded-xl whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-gray-100 self-end'
                  : 'bg-blue-50 border border-blue-100',
              ]"
            >
              <div class="text-xs font-semibold mb-1">
                {{ m.role === "user" ? "You" : "AI" }}
              </div>

              <!-- 줄바꿈 제거(가로 스크롤), 표는 유지 -->
              <div
                v-if="m.role === 'assistant'"
                class="prose prose-sm max-w-none prose-table:shadow-sm"
                v-html="renderMD(m.content)"
              />
              <div v-else class="whitespace-pre-wrap">{{ m.content }}</div>
            </div>
          </template>
        </div>

        <!-- 작성 중 버블 -->
        <div
          v-if="pending"
          class="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-xs text-gray-600"
        >
          AI가 응답을 작성 중입니다…
        </div>

        <div v-if="error" class="text-xs text-red-500">오류: {{ error }}</div>

        <!-- 빠른 질문 버튼 -->
        <div
          v-if="messages.filter((m) => m.role !== 'system').length <= 1"
          class="pt-2"
        >
          <div class="text-xs text-gray-500 mb-2">빠른 질문</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="q in quickPrompts"
              :key="q"
              class="px-2 py-1 rounded-full border text-xs hover:bg-gray-50"
              @click="askQuick(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
      </div>

      <!-- 입력 폼 -->
      <form class="p-3 border-t bg-gray-50" @submit.prevent="onSubmit">
        <textarea
          id="chat-input"
          v-model="input"
          rows="2"
          :placeholder="props.placeholder"
          class="w-full text-sm p-2 border rounded-lg outline-none focus:ring"
        />
        <div class="flex justify-end mt-2">
          <button
            class="px-3 py-1.5 bg-black text-white rounded-lg text-sm disabled:opacity-50"
            :disabled="pending || !input.trim()"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.prose :where(table) {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 0.5rem;
}
.prose :where(th, td) {
  border: 1px solid #e5e7eb;
  padding: 0.5rem 0.6rem;
}
.prose :where(thead th) {
  background: #eef2ff;
  font-weight: 600;
}
.prose :where(pre) {
  background: #0b0f190d;
  padding: 0.75rem;
  border-radius: 0.5rem;
}
.prose :where(pre) {
  background: #0b0f190d;
  padding: 0.75rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: pre; /* 줄바꿈 방지 */
  font-size: 0.85rem;
  line-height: 1.6;
}
.prose :where(pre code) {
  white-space: pre; /* 중첩 보정 */
}
</style>
