<script setup lang="ts">
import { ChevronRight, ChevronDown, Folder } from 'lucide-vue-next';

const props = defineProps<{
  node: any;
  depth: number;
  selectedId: string;
  expandedDirs: Set<string>;
}>();

const emit = defineEmits(['select', 'toggle']);

const isExpanded = (path: string) => props.expandedDirs.has(path);
</script>

<template>
  <div v-if="props.node.type === 'directory'" class="flex flex-col">
    <button
      @click="emit('select', props.node)"
      class="w-full text-left px-2 py-1 rounded flex items-center transition-all group relative"
      :class="[
        props.selectedId === props.node.path ? 'bg-[var(--primary-weak)] text-[var(--primary)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-2)]'
      ]"
      :style="{ paddingLeft: (props.depth * 12 + 4) + 'px' }"
    >
      <!-- 图标区域：独立点击控制展开收缩 -->
      <span 
        class="mr-1 shrink-0 opacity-60 hover:text-[var(--primary)] hover:opacity-100 p-1 rounded transition-all z-10"
        @click.stop="emit('toggle', props.node)"
      >
        <ChevronDown v-if="isExpanded(props.node.path)" class="w-3.5 h-3.5" />
        <ChevronRight v-else class="w-3.5 h-3.5" />
      </span>
      
      <Folder class="w-4 h-4 mr-2 text-[var(--primary)] opacity-70" />
      
      <span class="text-sm truncate flex-grow">{{ props.node.name }}</span>
    </button>
    
    <div v-if="isExpanded(props.node.path)" class="flex flex-col">
      <FileTreeNode 
        v-for="child in props.node.children" 
        :key="child.path" 
        :node="child" 
        :depth="props.depth + 1"
        :selected-id="props.selectedId"
        :expanded-dirs="props.expandedDirs"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
button {
  outline: none;
}
</style>
