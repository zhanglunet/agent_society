<script setup lang="ts">
import { FileCode, Folder, Loader2 } from 'lucide-vue-next';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { ref, inject, onMounted, computed } from 'vue';
import { useDialog } from 'primevue/usedialog';
import FileTreeNode from './FileTreeNode.vue';
import { openFileViewer } from '../file-viewer';

const dialogRef = inject<any>('dialogRef');
const dialog = useDialog();
const orgId = ref<string | undefined>();
const files = ref<any[]>([]);
const loading = ref(false);
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

// 当前选中的目录
const currentDir = ref<any>(null);

// 当前目录下的文件列表（过滤掉文件夹）
const currentItems = computed(() => {
  let items = [];
  if (currentDir.value) {
    items = currentDir.value.children || [];
  } else {
    // 默认显示根目录下的内容
    items = fileTree.value[0]?.children || [];
  }
  // 仅保留文件类型
  return items.filter((item: any) => item.type === 'file');
});

const toggleDir = (node: any) => {
  const path = node.path;
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path);
  } else {
    expandedDirs.value.add(path);
  }
};

const selectFile = async (file: any) => {
  if (file.type === 'directory') {
    // 切换选中的目录
    currentDir.value = file;
    selectedId.value = file.path;
    // 自动展开父级目录
    const parts = file.path.split('/');
    let pathAcc = '';
    parts.forEach((part: string) => {
      pathAcc = pathAcc ? `${pathAcc}/${part}` : part;
      expandedDirs.value.add(pathAcc);
    });
    return;
  }
  
  // 点击文件时使用文件查看器打开
  if (orgId.value) {
    const apiPath = file.path.replace(/^root\//, '');
    openFileViewer({
      dialog,
      workspaceId: orgId.value,
      filePath: apiPath,
      width: '85vw',
      height: '80vh'
    });
  }
  
  // 更新选中状态
  selectedId.value = file.path;
};

const fetchData = async () => {
  if (!orgId.value) return;
  
  loading.value = true;
  try {
    const res = await fetch(`/api/workspaces/${orgId.value}`);
    if (res.ok) {
      const data = await res.json();
      files.value = data.files || [];
      // 初始化选中状态：只展开并选中根目录 Workspace
      if (fileTree.value.length > 0) {
        const root = fileTree.value[0];
        currentDir.value = root;
        selectedId.value = root.path;
        expandedDirs.value.clear();
        expandedDirs.value.add(root.path);
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
      <SplitterPanel :size="30" :minSize="20" class="flex flex-col border-r border-[var(--border)] bg-[var(--surface-2)] relative">
        <div class="p-3 border-b border-[var(--border)] bg-[var(--surface-1)] shrink-0">
          <div class="flex flex-col">
            <span class="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">项目工作区 ({{ files.length }})</span>
            <span v-if="orgId" class="text-[10px] text-[var(--text-3)] opacity-70 mt-0.5">组织: {{ orgId }}</span>
          </div>
        </div>
        
        <div class="flex-grow relative overflow-hidden">
          <div class="absolute inset-0 overflow-y-auto p-2">
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
                @toggle="toggleDir"
              />
            </div>
          </div>
        </div>
      </SplitterPanel>

      <!-- 右侧预览与列表 -->
      <SplitterPanel :size="70" class="flex flex-col bg-[var(--bg)]">
        <!-- 面包屑导航 -->
        <div class="p-3 border-b border-[var(--border)] bg-[var(--surface-1)] flex items-center">
          <div class="flex items-center text-xs text-[var(--text-2)] overflow-hidden">
            <Folder class="w-3.5 h-3.5 mr-2 text-[var(--primary)] opacity-70" />
            <span class="font-medium truncate">{{ currentDir ? currentDir.path : '根目录' }}</span>
          </div>
        </div>

        <!-- 文件列表 -->
        <div class="flex-grow overflow-hidden relative">
          <div class="absolute inset-0 flex flex-col bg-[var(--bg)]">
            <div class="flex-grow overflow-y-auto">
              <div v-if="currentItems.length === 0" class="flex flex-col items-center justify-center py-20 text-[var(--text-3)] opacity-50">
                <FileCode class="w-16 h-16 mb-4" />
                <p>该目录下暂无文件</p>
              </div>
              <table v-else class="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr class="border-b border-[var(--border)] bg-[var(--surface-1)] sticky top-0 z-10 shadow-sm">
                    <th class="py-2.5 px-4 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider w-10"></th>
                    <th class="py-2.5 px-2 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">名称</th>
                    <th class="py-2.5 px-4 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider w-24">大小</th>
                    <th class="py-2.5 px-4 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider w-40">修改时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in currentItems"
                    :key="item.path"
                    @click="selectFile(item)"
                    class="border-b border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer group"
                  >
                    <td class="py-2.5 px-4">
                      <FileCode class="w-4 h-4 text-[var(--text-3)] opacity-70 group-hover:text-[var(--primary)]" />
                    </td>
                    <td class="py-2.5 px-2 min-w-0">
                      <span class="text-sm font-medium text-[var(--text-1)] truncate">{{ item.name }}</span>
                    </td>
                    <td class="py-2.5 px-4">
                      <span class="text-xs text-[var(--text-3)]">
                        {{ (item.size / 1024).toFixed(1) + ' KB' }}
                      </span>
                    </td>
                    <td class="py-2.5 px-4 text-right sm:text-left">
                      <span class="text-xs text-[var(--text-3)] whitespace-nowrap">{{ formatTime(item.modifiedAt) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>
