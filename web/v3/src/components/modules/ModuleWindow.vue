<script setup lang="ts">
/**
 * 模块管理窗口组件
 * 
 * 职责：
 * - 可拖拽移动的非模态窗口
 * - 左侧模块列表，右侧管理页面
 * - 可以同时与聊天等其他内容交互
 * 
 * @author Agent Society
 */
import { ref, onMounted, watch, computed } from 'vue';
import { apiService, type ModuleInfo, type ModuleWebComponent } from '../../services/api';
import { Puzzle, X, GripVertical } from 'lucide-vue-next';
import Button from 'primevue/button';
import ScrollPanel from 'primevue/scrollpanel';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const modules = ref<ModuleInfo[]>([]);
const loading = ref(false);
const selectedModule = ref<ModuleInfo | null>(null);
const panelLoading = ref(false);
const webComponent = ref<ModuleWebComponent | null>(null);

// 窗口位置
const windowX = ref(100);
const windowY = ref(100);
const isDragging = ref(false);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

/**
 * 有管理界面的模块
 */
const modulesWithPanel = computed(() => {
  return modules.value.filter(m => m.hasWebComponent);
});

/**
 * 加载模块列表
 */
const loadModules = async () => {
  loading.value = true;
  try {
    modules.value = await apiService.getModules();
    // 默认选中第一个有管理界面的模块
    if (modulesWithPanel.value.length > 0 && !selectedModule.value) {
      const firstModule = modulesWithPanel.value[0];
      if (firstModule) {
        selectModule(firstModule);
      }
    }
  } catch (err) {
    console.error('加载模块列表失败:', err);
    modules.value = [];
  } finally {
    loading.value = false;
  }
};

/**
 * 选中模块
 */
const selectModule = async (module: ModuleInfo) => {
  if (selectedModule.value?.name === module.name) return;
  
  selectedModule.value = module;
  panelLoading.value = true;
  webComponent.value = null;
  
  try {
    const component = await apiService.getModuleWebComponent(module.name);
    if (component) {
      webComponent.value = component;
    }
  } catch (err) {
    console.error('加载模块组件失败:', err);
  } finally {
    panelLoading.value = false;
  }
};

/**
 * 关闭窗口
 */
const close = () => {
  emit('update:modelValue', false);
};

/**
 * 切换窗口显示
 */
const toggle = () => {
  emit('update:modelValue', !props.modelValue);
};

/**
 * 开始拖拽
 */
const startDrag = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // 只有点击标题栏才拖拽
  if (!target.closest('.window-header')) return;
  
  isDragging.value = true;
  dragOffsetX.value = e.clientX - windowX.value;
  dragOffsetY.value = e.clientY - windowY.value;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

/**
 * 拖拽中
 */
const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return;
  
  windowX.value = e.clientX - dragOffsetX.value;
  windowY.value = e.clientY - dragOffsetY.value;
  
  // 限制在视口内
  windowX.value = Math.max(0, Math.min(windowX.value, window.innerWidth - 400));
  windowY.value = Math.max(0, Math.min(windowY.value, window.innerHeight - 300));
};

/**
 * 停止拖拽
 */
const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

/**
 * 获取模块图标
 */
const getModuleIcon = (name: string) => {
  const icons: Record<string, string> = {
    chrome: '🌐',
    ffmpeg: '🎞️',
    ssh: '🔐',
    ui_page: '📄'
  };
  return icons[name] || '📦';
};

// 监听窗口打开，加载模块
watch(() => props.modelValue, (open) => {
  if (open && modules.value.length === 0) {
    loadModules();
  }
}, { immediate: true });

onMounted(() => {
  loadModules();
});

defineExpose({
  toggle,
  loadModules
});
</script>

<template>
  <div>
    <!-- 窗口 -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-show="modelValue"
        class="fixed z-40 flex shadow-2xl rounded-lg overflow-hidden border border-[var(--border)]"
        style="width: 700px; height: 500px;"
        :style="{ left: windowX + 'px', top: windowY + 'px' }"
        @mousedown="startDrag"
      >
        <!-- 窗口容器 -->
        <div class="flex w-full h-full bg-[var(--surface-1)]">
          
          <!-- 左侧：模块列表 -->
          <div class="w-44 flex-shrink-0 border-r border-[var(--border)] flex flex-col">
            <!-- 可拖拽标题栏 -->
            <div class="window-header p-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)] cursor-move select-none">
              <div class="flex items-center gap-1.5">
                <GripVertical class="w-4 h-4 text-[var(--text-3)]" />
                <span class="font-semibold text-sm text-[var(--text-1)]">模块管理</span>
              </div>
              <Button 
                variant="text" 
                rounded
                class="!p-1"
                @click.stop="close"
              >
                <X class="w-3.5 h-3.5 text-[var(--text-3)] hover:text-[var(--text-1)]" />
              </Button>
            </div>

            <!-- 模块列表 -->
            <ScrollPanel class="flex-1" style="width: 100%;">
              <div class="p-1.5 space-y-0.5">
                <!-- 加载中 -->
                <div v-if="loading" class="flex justify-center py-4">
                  <div class="animate-spin w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full"></div>
                </div>

                <!-- 空状态 -->
                <div v-else-if="modulesWithPanel.length === 0" class="text-center py-4 text-[var(--text-3)] text-xs">
                  暂无管理界面
                </div>

                <!-- 模块项 -->
                <button
                  v-for="module in modulesWithPanel"
                  :key="module.name"
                  class="w-full text-left p-2 rounded transition-colors text-xs"
                  :class="[
                    selectedModule?.name === module.name 
                      ? 'bg-[var(--primary-weak)] text-[var(--primary)]' 
                      : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
                  ]"
                  @click="selectModule(module)"
                >
                  <div class="flex items-center gap-1.5">
                    <span>{{ getModuleIcon(module.name) }}</span>
                    <span class="font-medium truncate">{{ module.name }}</span>
                  </div>
                  <p class="text-[10px] mt-0.5 truncate opacity-70">{{ module.toolGroupDescription }}</p>
                </button>
              </div>
            </ScrollPanel>
          </div>

          <!-- 右侧：管理页面 -->
          <div class="flex-1 flex flex-col min-w-0">
            <!-- 头部 -->
            <div class="p-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
              <span class="font-semibold text-sm text-[var(--text-1)]">
                {{ webComponent?.displayName || selectedModule?.name || '模块详情' }}
              </span>
            </div>

            <!-- 内容区 -->
            <div class="flex-1 relative overflow-hidden bg-[var(--surface-1)]">
              <!-- 加载中 -->
              <div v-if="panelLoading" class="absolute inset-0 flex items-center justify-center">
                <div class="animate-spin w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full"></div>
              </div>

              <!-- 空状态 -->
              <div v-else-if="!webComponent" class="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-3)]">
                <Puzzle class="w-10 h-10 mb-2 opacity-50" />
                <p class="text-sm">无法加载模块管理界面</p>
              </div>

              <!-- 模块面板内容 -->
              <div v-else class="absolute inset-0 overflow-auto">
                <div class="module-panel-content p-3">
                  <!-- 注入模块的 HTML -->
                  <div v-html="webComponent.html"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.module-panel-content :deep(*) {
  color: inherit;
}
</style>
