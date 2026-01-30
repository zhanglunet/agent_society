<script setup lang="ts">
import { Briefcase } from 'lucide-vue-next';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { ref } from 'vue';

// 模拟工件数据
const artifacts = ref([
  {
    id: '1',
    title: 'roadmap.md',
    type: 'markdown',
    content: '# 项目路线图\n\n## 阶段一: 基础框架\n- [x] 环境搭建\n- [x] 主题系统\n\n## 阶段二: 核心交互\n- [ ] 窗口系统',
    timestamp: Date.now() - 1000 * 60 * 60,
    author: 'root'
  },
  {
    id: '2',
    title: 'api_service.ts',
    type: 'typescript',
    content: 'export const api = {\n  fetch: () => Promise.resolve([])\n};',
    timestamp: Date.now() - 1000 * 60 * 120,
    author: 'agent_01'
  }
]);

const selectedId = ref(artifacts.value[0]?.id || '');
const selectedArtifact = ref<any>(artifacts.value[0] || null);

const selectArtifact = (item: any) => {
  selectedId.value = item.id;
  selectedArtifact.value = item;
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString();
};
</script>

<template>
  <div class="flex flex-col h-[600px] bg-transparent overflow-hidden rounded-b-xl text-[var(--text-1)]">
    <Splitter class="flex-grow border-none">
      <!-- 左侧列表 -->
      <SplitterPanel :size="30" :minSize="20" class="flex flex-col border-r border-[var(--border)] bg-[var(--surface-2)]">
        <div class="p-3 border-b border-[var(--border)] bg-[var(--surface-1)]">
          <span class="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">生成的工件 ({{ artifacts.length }})</span>
        </div>
        <div class="flex-grow overflow-y-auto p-2 space-y-1">
          <button
            v-for="item in artifacts"
            :key="item.id"
            @click="selectArtifact(item)"
            class="w-full text-left p-3 rounded-lg transition-all"
            :class="[selectedId === item.id ? 'bg-[var(--primary-weak)] text-[var(--primary)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-2)]']"
          >
            <div class="flex items-center space-x-2 mb-1">
              <Briefcase class="w-3.5 h-3.5" />
              <span class="font-medium text-sm truncate">{{ item.title }}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] opacity-60">
              <span>{{ item.author }}</span>
              <span>{{ new Date(item.timestamp).toLocaleDateString() }}</span>
            </div>
          </button>
        </div>
      </SplitterPanel>

      <!-- 右侧预览 -->
      <SplitterPanel :size="70" class="flex flex-col bg-[var(--bg)]">
        <div v-if="selectedArtifact" class="flex flex-col h-full overflow-hidden">
          <div class="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <h3 class="font-bold text-[var(--text-1)]">{{ selectedArtifact.title }}</h3>
              <p class="text-[10px] text-[var(--text-3)] mt-0.5">最后修改于 {{ formatTime(selectedArtifact.timestamp) }}</p>
            </div>
          </div>
          <div class="flex-grow overflow-auto p-4">
            <pre class="text-sm font-mono p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-2)] whitespace-pre-wrap">{{ selectedArtifact.content }}</pre>
          </div>
        </div>
        <div v-else class="flex flex-col items-center justify-center h-full text-[var(--text-3)] opacity-50">
          <Briefcase class="w-12 h-12 mb-4" />
          <p>选择一个工件查看内容</p>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>
