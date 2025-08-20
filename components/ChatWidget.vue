<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useChat } from "../composables/useChat";

type Props = {
  title?: string;
  placeholder?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  maxHistory?: number;
  position?: "br" | "bl" | "tr" | "tl";
};
const props = withDefaults(defineProps<Props>(), {
  title: "AI Chat",
  placeholder: "질문을 입력하세요...",
  temperature: 0.4,
  maxHistory: 10,
  position: "br",
});

const open = ref(false);
const input = ref("");
const expanding = ref(false);
const { messages, pending, error, send, reset } = useChat({
  model: props.model,
  temperature: props.temperature,
  maxHistory: props.maxHistory,
  systemPrompt: props.systemPrompt,
});

const btnPos = computed(() => {
  const p = props.position;
  const base = "fixed z-50 m-4";
  if (p === "br") return `${base} right-4 bottom-4`;
  if (p === "bl") return `${base} left-4 bottom-4`;
  if (p === "tr") return `${base} right-4 top-4`;
  return `${base} left-4 top-4`;
});

function toggle() {
  if (!open.value) {
    expanding.value = true;
    setTimeout(() => {
      open.value = true;
      expanding.value = false;
    }, 300); // 애니메이션 지속 시간과 동일하게 설정
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
    💬
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

      <div class="flex-1 overflow-auto p-3 space-y-2 text-sm">
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
              <strong v-if="m.role === 'user'">You:</strong>
              <strong v-else>AI:</strong>
              <span class="ml-2">{{ m.content }}</span>
            </div>
          </template>
        </div>

        <div v-if="pending" class="text-xs text-gray-500">생각 중...</div>
        <div v-if="error" class="text-xs text-red-500">오류: {{ error }}</div>
      </div>

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
</style>
