<script setup lang="ts">
import { FileCode, Folder, Loader2, ChevronRight, ChevronDown } from 'lucide-vue-next';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { ref, inject, onMounted, computed } from 'vue';

const dialogRef = inject<any>('dialogRef');
const orgId = ref<string | undefined>();
const files = ref<any[]>([]);
const loading = ref(false);
const contentLoading = ref(false);
const expandedDirs = ref<Set<string>>(new Set());

// 树形结构转换
const fileTree = computed(() => {
  const root: any = { name: 'root', type: 'directory', children: [], path: '' };
  
  files.value.forEach((file: any) => {
    const parts = file.path.split('/');
    let current = root;
    let currentPath = '';
    
    parts.forEach((part: string, index: number) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (index === parts.length - 1) {
        current.children.push({ ...file, type: 'file' });
      } else {
        let dir = current.children.find((c: any) => c.type === 'directory' && c.name === part);
        if (!dir) {
          dir = { name: part, type: 'directory', children: [], path: currentPath };
          current.children.push(dir);
        }
        current = dir;
      }
    });
  });

  // 排序：目录在前，文件在后，按名称排序
  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node: any) => {
      if (node.children) sortNodes(node.children);
    });
  };
  
  sortNodes(root.children);
  return root.children;
});

const selectedId = ref('');
const selectedFile = ref<any>(null);
const fileContent = ref('');

const toggleDir = (path: string) => {
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path);
  } else {
    expandedDirs.value.add(path);
  }
};

const selectFile = async (file: any) => {
  if (file.type === 'directory') {
    toggleDir(file.path);
    return;
  }
  
  selectedId.value = file.path;
  selectedFile.value = file;
  fileContent.value = '';
  
  if (!orgId.value) return;
  
  contentLoading.value = true;
  try {
    const res = await fetch(`/api/workspaces/${orgId.value}/file?path=${encodeURIComponent(file.path)}`);
    if (res.ok) {
      const data = await res.json();
      fileContent.value = data.content || '';
    }
  } catch (err) {
    console.error('加载文件内容失败:', err);
  } finally {
    contentLoading.value = false;
  }
};

const fetchData = async () => {
  if (!orgId.value) return;
  
  loading.value = true;
  try {
    const res = await fetch(`/api/workspaces/${orgId.value}`);
    if (res.ok) {
      const data = await res.json();
      files.value = data.files || [];
      // 默认展开第一层目录
      fileTree.value.forEach((node: any) => {
        if (node.type === 'directory') expandedDirs.value.add(node.path);
      });
    }
  } catch (err) {
    console.error('获取工作空间文件失败:', err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (dialogRef && dialogRef.value) {
    orgId.value = dialogRef.value.data?.orgId;
    fetchData();
  }
});

const formatTime = (ts: string) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
};

const icons = { ChevronRight, ChevronDown, Folder, FileCode };

// 递归子组件定义
const FileTreeNode: any = {
  name: 'FileTreeNode',
  props: ['node', 'depth', 'selectedId', 'expandedDirs'],
  emits: ['select'],
  setup(props: any, { emit }: any) {
    return {
      ...icons,
      props,
      emit
    };
  },
  template: `
    <div class="flex flex-col">
      <button
        @click="emit('select', props.node)"
        class="w-full text-left px-2 py-1.5 rounded flex items-center transition-all group"
        :class="[
          props.selectedId === props.node.path ? 'bg-[var(--primary-weak)] text-[var(--primary)]' : 'hover:bg-[var(--surface-3)] text-[var(--text-2)]'
        ]"
        :style="{ paddingLeft: (props.depth * 12 + 8) + 'px' }"
      >
        <span class="mr-1.5 shrink-0 opacity-60">
          <template v-if="props.node.type === 'directory'">
            <ChevronDown v-if="props.expandedDirs.has(props.node.path)" class="w-3.5 h-3.5" />
            <ChevronRight v-else class="w-3.5 h-3.5" />
          </template>
          <span v-else class="w-3.5 inline-block"></span>
        </span>
        
        <Folder v-if="props.node.type === 'directory'" class="w-4 h-4 mr-2 text-[var(--primary)] opacity-70" />
        <FileCode v-else class="w-4 h-4 mr-2 text-[var(--text-3)] group-hover:text-[var(--primary)] opacity-70" />
        
        <span class="text-sm truncate flex-grow">{{ props.node.name }}</span>
      </button>
      
      <div v-if="props.node.type === 'directory' && props.expandedDirs.has(props.node.path)" class="flex flex-col">
        <FileTreeNode 
          v-for="child in props.node.children" 
          :key="child.path" 
          :node="child" 
          :depth="props.depth + 1"
          :selected-id="props.selectedId"
          :expanded-dirs="props.expandedDirs"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  `
};
</script>

<template>
  <div class="flex flex-col h-[600px] bg-transparent overflow-hidden rounded-b-xl text-[var(--text-1)]">
    <Splitter class="flex-grow border-none">
      <!-- 左侧列表 -->
      <SplitterPanel :size="30" :minSize="20" class="flex flex-col border-r border-[var(--border)] bg-[var(--surface-2)]">
        <div class="p-3 border-b border-[var(--border)] bg-[var(--surface-1)]">
          <div class="flex flex-col">
            <span class="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">项目工作区 ({{ files.length }})</span>
            <span v-if="orgId" class="text-[10px] text-[var(--text-3)] opacity-70 mt-0.5">组织: {{ orgId }}</span>
          </div>
        </div>
        
        <div class="flex-grow overflow-y-auto p-2">
          <div v-if="loading" class="flex flex-col items-center justify-center py-10 text-[var(--text-3)] opacity-50">
            <Loader2 class="w-6 h-6 animate-spin mb-2" />
            <span class="text-xs">加载文件列表中...</span>
          </div>
          <div v-else-if="files.length === 0" class="flex flex-col items-center justify-center py-10 text-[var(--text-3)] opacity-50">
            <Folder class="w-8 h-8 mb-2" />
            <span class="text-xs">暂无文件</span>
          </div>
          <div v-else class="space-y-0.5">
            <!-- 递归渲染文件树 -->
            <FileTreeNode 
              v-for="node in fileTree" 
              :key="node.path" 
              :node="node" 
              :depth="0"
              :selected-id="selectedId"
              :expanded-dirs="expandedDirs"
              @select="selectFile"
            />
          </div>
        </div>
      </SplitterPanel>

      <!-- 右侧预览 -->
      <SplitterPanel :size="70" class="flex flex-col bg-[var(--bg)]">
        <div v-if="selectedFile" class="flex flex-col h-full overflow-hidden">
          <div class="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-1)]">
            <div class="flex flex-col min-w-0">
              <h3 class="font-bold text-[var(--text-1)] truncate">{{ selectedFile.name }}</h3>
              <p class="text-[10px] text-[var(--text-3)] mt-0.5 truncate">{{ selectedFile.path }}</p>
            </div>
            <div class="flex items-center space-x-4 shrink-0 ml-4 text-[10px] text-[var(--text-3)]">
              <div class="flex flex-col items-end">
                <span>大小: {{ (selectedFile.size / 1024).toFixed(1) }} KB</span>
                <span>修改于: {{ formatTime(selectedFile.modifiedAt) }}</span>
              </div>
            </div>
          </div>
          
          <div class="flex-grow overflow-hidden relative bg-[var(--surface-2)]">
            <div v-if="contentLoading" class="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)] bg-opacity-50 z-10">
              <Loader2 class="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
            <div class="h-full overflow-auto p-4">
              <pre v-if="fileContent" class="text-sm font-mono text-[var(--text-2)] whitespace-pre-wrap break-all">{{ fileContent }}</pre>
              <div v-else-if="!contentLoading" class="flex flex-col items-center justify-center h-full text-[var(--text-3)] opacity-50">
                <FileCode class="w-12 h-12 mb-2" />
                <p>文件内容为空或无法读取</p>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="flex flex-col items-center justify-center h-full text-[var(--text-3)] opacity-50">
          <Folder class="w-12 h-12 mb-4" />
          <p>从左侧选择一个文件查看内容</p>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>
