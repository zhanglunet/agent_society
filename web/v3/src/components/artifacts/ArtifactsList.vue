<script setup lang="ts">
import { FileCode, Folder, Loader2 } from 'lucide-vue-next';
import Button from 'primevue/button';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { ref, inject, onMounted, computed } from 'vue';
import FileTreeNode from './FileTreeNode.vue';

const dialogRef = inject<any>('dialogRef');
const orgId = ref<string | undefined>();
const files = ref<any[]>([]);
const loading = ref(false);
const contentLoading = ref(false);
const expandedDirs = ref<Set<string>>(new Set());

// 树形结构转换
const fileTree = computed(() => {
  const workspaceRoot: any = { 
    name: 'Workspace', 
    type: 'directory', 
    children: [], 
    path: 'root' // 使用 'root' 作为根路径标识
  };
  
  files.value.forEach((file: any) => {
    // 确保 path 不以 / 开头，方便 split
    const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    const parts = cleanPath.split('/');
    let current = workspaceRoot;
    let currentPath = '';
    
    parts.forEach((part: string, index: number) => {
      // 构建当前部分的路径，相对于 workspaceRoot
      const partPath = currentPath ? `${currentPath}/${part}` : part;
      const fullPath = `root/${partPath}`; // 保持全局唯一路径
      
      if (index === parts.length - 1) {
        // 检查是否已经存在同名文件，防止重复
        if (!current.children.find((c: any) => c.type === 'file' && c.name === part)) {
          current.children.push({ ...file, type: 'file', name: part, path: fullPath });
        }
      } else {
        let dir = current.children.find((c: any) => c.type === 'directory' && c.name === part);
        if (!dir) {
          dir = { name: part, type: 'directory', children: [], path: fullPath };
          current.children.push(dir);
        }
        current = dir;
        currentPath = partPath;
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
  
  sortNodes(workspaceRoot.children);
  return [workspaceRoot]; // 返回包含根目录的数组
});

const selectedId = ref('root'); // 默认选中根目录
const selectedFile = ref<any>(null);
const fileContent = ref('');

// 当前选中的目录
const currentDir = ref<any>(null);

// 当前目录下的文件和文件夹列表
const currentItems = computed(() => {
  if (currentDir.value) {
    return currentDir.value.children || [];
  }
  // 默认显示根目录下的内容
  return fileTree.value[0]?.children || [];
});

const toggleDir = (node: any) => {
  const path = node.path;
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path);
  } else {
    expandedDirs.value.add(path);
  }
  // 切换目录时，更新右侧显示的内容
  currentDir.value = node;
  selectedId.value = node.path; // 标记当前选中的路径
  selectedFile.value = null; // 清除当前选中的文件预览
};

const selectFile = async (file: any) => {
  if (file.type === 'directory') {
    toggleDir(file);
    return;
  }
  
  selectedId.value = file.path;
  selectedFile.value = file;
  fileContent.value = '';
  
  if (!orgId.value) return;
  
  contentLoading.value = true;
  try {
    // API 请求时需要去掉 'root/' 前缀
    const apiPath = file.path.replace(/^root\//, '');
    const res = await fetch(`/api/workspaces/${orgId.value}/file?path=${encodeURIComponent(apiPath)}`);
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
      // 初始化选中状态
      if (fileTree.value.length > 0) {
        currentDir.value = fileTree.value[0];
        expandedDirs.value.add('root');
        // 默认展开第二层目录
        fileTree.value[0].children.forEach((node: any) => {
          if (node.type === 'directory') expandedDirs.value.add(node.path);
        });
      }
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

      <!-- 右侧预览与列表 -->
      <SplitterPanel :size="70" class="flex flex-col bg-[var(--bg)]">
        <!-- 面包屑导航或当前目录信息 -->
        <div class="p-3 border-b border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-between">
          <div class="flex items-center text-xs text-[var(--text-2)] overflow-hidden">
            <Folder class="w-3.5 h-3.5 mr-2 text-[var(--primary)] opacity-70" />
            <span class="font-medium truncate">{{ currentDir ? currentDir.path : '根目录' }}</span>
          </div>
          <div v-if="selectedFile" class="flex items-center ml-4">
            <Button 
              variant="text" 
              size="small" 
              class="!py-1 !px-2 !text-[10px]"
              @click="selectedFile = null"
            >
              返回列表
            </Button>
          </div>
        </div>

        <!-- 内容区域：文件预览或目录列表 -->
        <div class="flex-grow overflow-hidden relative">
          <!-- 文件预览 -->
          <div v-if="selectedFile" class="flex flex-col h-full overflow-hidden">
            <div class="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
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
            
            <div class="flex-grow overflow-hidden relative bg-[var(--bg)]">
              <div v-if="contentLoading" class="absolute inset-0 flex items-center justify-center bg-[var(--bg)] bg-opacity-50 z-10">
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

          <!-- 目录列表 -->
          <div v-else class="h-full flex flex-col bg-[var(--bg)]">
            <div class="overflow-y-auto p-4">
              <div v-if="currentItems.length === 0" class="flex flex-col items-center justify-center py-20 text-[var(--text-3)] opacity-50">
                <Folder class="w-16 h-16 mb-4" />
                <p>该目录下暂无内容</p>
              </div>
              <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <button
                  v-for="item in currentItems"
                  :key="item.path"
                  @click="selectFile(item)"
                  class="flex items-center p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--primary-weak)] hover:bg-[var(--surface-3)] transition-all group text-left"
                >
                  <Folder v-if="item.type === 'directory'" class="w-8 h-8 mr-3 text-[var(--primary)] opacity-70 group-hover:scale-110 transition-transform" />
                  <FileCode v-else class="w-8 h-8 mr-3 text-[var(--text-3)] group-hover:text-[var(--primary)] opacity-70 group-hover:scale-110 transition-transform" />
                  
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-[var(--text-1)] truncate">{{ item.name }}</span>
                    <span class="text-[10px] text-[var(--text-3)] truncate">
                      {{ item.type === 'directory' ? '文件夹' : (item.size / 1024).toFixed(1) + ' KB' }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>
