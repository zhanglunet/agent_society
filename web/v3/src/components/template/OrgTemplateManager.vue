<script setup lang="ts">
/**
 * 组织模板管理器组件
 * 
 * 功能：管理 org 目录下的组织模板，提供模板列表展示和模板内容编辑保存功能
 * 布局：左右结构，左侧模板列表，右侧上下排列编辑区展示 info.md 和 org.md
 * 
 * @author Agent Society
 */
import { ref, computed, onMounted, watch } from 'vue';
import Button from 'primevue/button';
import ScrollPanel from 'primevue/scrollpanel';
import Textarea from 'primevue/textarea';
import { Folder, FileText, Info, Building, Loader2, AlertCircle, Save, Check, X } from 'lucide-vue-next';
import { templateApi } from '../../services/templateApi';
import type { OrgTemplate } from '../../types';

// 组件状态
const templates = ref<OrgTemplate[]>([]);
const selectedTemplateId = ref<string>('');
const templateInfo = ref<string>('');
const templateOrg = ref<string>('');
const originalInfo = ref<string>('');
const originalOrg = ref<string>('');
const loading = ref(false);
const contentLoading = ref(false);
const saving = ref(false);
const error = ref<string>('');
const saveStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveMessage = ref<string>('');

// 计算属性：当前选中的模板
const selectedTemplate = computed(() => {
  return templates.value.find(t => t.id === selectedTemplateId.value);
});

// 计算属性：内容是否有变更
const hasChanges = computed(() => {
  return templateInfo.value !== originalInfo.value || templateOrg.value !== originalOrg.value;
});

/**
 * 加载模板列表
 */
const loadTemplates = async () => {
  loading.value = true;
  error.value = '';
  try {
    const data = await templateApi.getTemplates();
    templates.value = data;
    // 默认选中第一个模板
    if (data.length > 0 && !selectedTemplateId.value) {
      selectedTemplateId.value = data[0]!.id;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载模板列表失败';
  } finally {
    loading.value = false;
  }
};

/**
 * 加载选中模板的详细内容
 */
const loadTemplateContent = async (templateId: string) => {
  if (!templateId) return;
  
  contentLoading.value = true;
  saveStatus.value = 'idle';
  
  try {
    const content = await templateApi.getTemplateContent(templateId);
    templateInfo.value = content.info || '';
    templateOrg.value = content.org || '';
    // 保存原始内容用于对比变更
    originalInfo.value = content.info || '';
    originalOrg.value = content.org || '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载模板内容失败';
    templateInfo.value = '';
    templateOrg.value = '';
    originalInfo.value = '';
    originalOrg.value = '';
  } finally {
    contentLoading.value = false;
  }
};

/**
 * 保存模板内容
 */
const saveTemplate = async () => {
  if (!selectedTemplateId.value || !hasChanges.value) return;
  
  saving.value = true;
  saveStatus.value = 'idle';
  
  try {
    await templateApi.saveTemplateContent(selectedTemplateId.value, {
      info: templateInfo.value,
      org: templateOrg.value,
    });
    // 保存成功后更新原始内容
    originalInfo.value = templateInfo.value;
    originalOrg.value = templateOrg.value;
    saveStatus.value = 'success';
    saveMessage.value = '保存成功';
    // 3秒后清除成功状态
    setTimeout(() => {
      if (saveStatus.value === 'success') {
        saveStatus.value = 'idle';
      }
    }, 3000);
  } catch (err) {
    saveStatus.value = 'error';
    saveMessage.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
};

/**
 * 重置修改
 */
const resetChanges = () => {
  templateInfo.value = originalInfo.value;
  templateOrg.value = originalOrg.value;
  saveStatus.value = 'idle';
};

/**
 * 选择模板
 */
const selectTemplate = (template: OrgTemplate) => {
  // 如果当前有未保存的修改，提示用户
  if (hasChanges.value) {
    if (!confirm('当前修改未保存，切换模板将丢失修改，是否继续？')) {
      return;
    }
  }
  selectedTemplateId.value = template.id;
};

/**
 * 使用模板创建组织
 */
const useTemplate = () => {
  if (!selectedTemplate.value) return;
  // 触发创建组织的流程，通过事件通知父组件
  emit('useTemplate', selectedTemplate.value);
};

// 定义事件
const emit = defineEmits<{
  (e: 'useTemplate', template: OrgTemplate): void;
}>();

// 监听选中模板变化，加载内容
watch(selectedTemplateId, (newId) => {
  if (newId) {
    loadTemplateContent(newId);
  }
});

// 组件挂载时加载数据
onMounted(() => {
  loadTemplates();
});
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--surface-1)] text-[var(--text-1)]">
    <!-- 错误提示 -->
    <div v-if="error" class="p-4 bg-red-50 border-b border-red-200 flex items-center gap-2 text-red-600 shrink-0">
      <AlertCircle class="w-5 h-5" />
      <span class="text-sm">{{ error }}</span>
      <Button 
        variant="text" 
        size="small" 
        class="ml-auto text-red-600"
        @click="loadTemplates"
      >
        重试
      </Button>
    </div>

    <!-- 主内容区：左右布局 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 左侧：模板列表 -->
      <div class="w-64 flex flex-col border-r border-[var(--border)] bg-[var(--surface-2)]">
        <!-- 列表头部 -->
        <div class="p-4 border-b border-[var(--border)]">
          <div class="flex items-center gap-2 text-[var(--text-1)]">
            <Folder class="w-5 h-5 text-[var(--primary)]" />
            <span class="font-semibold">组织模板</span>
          </div>
          <p class="text-xs text-[var(--text-3)] mt-1">
            共 {{ templates.length }} 个模板
          </p>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex-1 flex items-center justify-center">
          <Loader2 class="w-6 h-6 animate-spin text-[var(--text-3)]" />
        </div>

        <!-- 空状态 -->
        <div v-else-if="templates.length === 0" class="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Folder class="w-12 h-12 text-[var(--text-3)] mb-3 opacity-50" />
          <p class="text-sm text-[var(--text-2)]">暂无组织模板</p>
          <p class="text-xs text-[var(--text-3)] mt-1">在 org 目录下添加模板文件夹</p>
        </div>

        <!-- 模板列表 -->
        <ScrollPanel v-else class="flex-1">
          <div class="p-2 space-y-1">
            <button
              v-for="template in templates"
              :key="template.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group"
              :class="[
                selectedTemplateId === template.id
                  ? 'bg-[var(--primary-weak)] border-l-2 border-[var(--primary)]'
                  : 'hover:bg-[var(--surface-3)] border-l-2 border-transparent'
              ]"
              @click="selectTemplate(template)"
            >
              <div 
                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                :class="[
                  selectedTemplateId === template.id
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface-3)] text-[var(--text-2)] group-hover:text-[var(--primary)]'
                ]"
              >
                <Building class="w-4 h-4" />
              </div>
              <div class="flex-1 min-w-0">
                <p 
                  class="font-medium text-sm truncate"
                  :class="selectedTemplateId === template.id ? 'text-[var(--primary)]' : 'text-[var(--text-1)]'"
                >
                  {{ template.name }}
                </p>
                <p class="text-xs text-[var(--text-3)] truncate">
                  {{ template.id }}
                </p>
              </div>
              <!-- 未保存标记 -->
              <div 
                v-if="selectedTemplateId === template.id && hasChanges" 
                class="w-2 h-2 rounded-full bg-orange-500 shrink-0"
                title="有未保存的修改"
              />
            </button>
          </div>
        </ScrollPanel>
      </div>

      <!-- 右侧：模板内容编辑区（上下结构） -->
      <div class="flex-1 flex flex-col min-w-0 bg-[var(--surface-1)] overflow-hidden">
        <!-- 内容头部 -->
        <div class="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div v-if="selectedTemplate" class="w-10 h-10 rounded-xl bg-[var(--primary-weak)] flex items-center justify-center">
              <Building class="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <h2 class="font-semibold text-[var(--text-1)]">
                {{ selectedTemplate?.name || '选择模板' }}
              </h2>
              <p v-if="selectedTemplate" class="text-xs text-[var(--text-3)]">
                模板 ID: {{ selectedTemplate.id }}
                <span v-if="hasChanges" class="ml-2 text-orange-500">(有未保存的修改)</span>
              </p>
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex items-center gap-2">
            <!-- 保存状态提示 -->
            <div 
              v-if="saveStatus !== 'idle'" 
              class="flex items-center gap-1 px-3 py-1 rounded-lg text-sm"
              :class="[
                saveStatus === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              ]"
            >
              <Check v-if="saveStatus === 'success'" class="w-4 h-4" />
              <X v-else class="w-4 h-4" />
              {{ saveMessage }}
            </div>
            
            <!-- 重置按钮 -->
            <Button
              v-if="selectedTemplate && hasChanges"
              variant="text"
              size="small"
              :disabled="saving"
              @click="resetChanges"
            >
              <X class="w-4 h-4 mr-1" />
              重置
            </Button>
            
            <!-- 保存按钮 -->
            <Button
              v-if="selectedTemplate"
              variant="primary"
              size="small"
              :disabled="!hasChanges || saving"
              :loading="saving"
              class="active:translate-y-[1px] active:scale-[0.98] transition-all"
              @click="saveTemplate"
            >
              <Save class="w-4 h-4 mr-1" />
              保存
            </Button>
            
            <!-- 使用模板按钮 -->
            <Button
              v-if="selectedTemplate"
              variant="text"
              size="small"
              :disabled="hasChanges"
              v-tooltip.top="hasChanges ? '请先保存修改' : '使用此模板创建组织'"
              @click="useTemplate"
            >
              <Building class="w-4 h-4 mr-1" />
              使用
            </Button>
          </div>
        </div>

        <!-- 内容区：上下双文本域编辑区 -->
        <div v-if="selectedTemplate" class="flex-1 overflow-hidden">
          <ScrollPanel class="h-full">
            <div class="p-6 space-y-6">
              <!-- info.md -->
              <div class="flex flex-col">
                <div class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] border-b-0 rounded-t-lg flex items-center gap-2">
                  <Info class="w-4 h-4 text-[var(--primary)]" />
                  <span class="text-sm font-medium text-[var(--text-1)]">info.md</span>
                  <span class="text-xs text-[var(--text-3)] ml-auto">模板描述信息</span>
                </div>
                <div class="border border-[var(--border)] rounded-b-lg bg-[var(--surface-2)] overflow-hidden">
                  <div v-if="contentLoading" class="p-8 flex items-center justify-center">
                    <Loader2 class="w-5 h-5 animate-spin text-[var(--text-3)]" />
                  </div>
                  <Textarea
                    v-else
                    v-model="templateInfo"
                    class="w-full resize-none !bg-[var(--surface-2)] !border-0 !rounded-none !p-4 !text-sm !leading-relaxed !text-[var(--text-1)] font-mono focus:!ring-1 focus:!ring-[var(--primary)]"
                    :class="templateInfo !== originalInfo ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : ''"
                    rows="3"
                    auto-resize
                  />
                </div>
              </div>

              <!-- org.md -->
              <div class="flex flex-col">
                <div class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] border-b-0 rounded-t-lg flex items-center gap-2">
                  <FileText class="w-4 h-4 text-[var(--primary)]" />
                  <span class="text-sm font-medium text-[var(--text-1)]">org.md</span>
                  <span class="text-xs text-[var(--text-3)] ml-auto">组织架构定义</span>
                </div>
                <div class="border border-[var(--border)] rounded-b-lg bg-[var(--surface-2)] overflow-hidden">
                  <div v-if="contentLoading" class="p-8 flex items-center justify-center">
                    <Loader2 class="w-5 h-5 animate-spin text-[var(--text-3)]" />
                  </div>
                  <Textarea
                    v-else
                    v-model="templateOrg"
                    class="w-full resize-none !bg-[var(--surface-2)] !border-0 !rounded-none !p-4 !text-sm !leading-relaxed !text-[var(--text-1)] font-mono focus:!ring-1 focus:!ring-[var(--primary)]"
                    :class="templateOrg !== originalOrg ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : ''"
                    rows="3"
                    auto-resize
                  />
                </div>
              </div>
            </div>
          </ScrollPanel>
        </div>

        <!-- 未选择模板时的空状态 -->
        <div v-else class="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div class="w-20 h-20 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mb-4">
            <Folder class="w-10 h-10 text-[var(--text-3)]" />
          </div>
          <h3 class="text-lg font-medium text-[var(--text-1)] mb-2">选择一个模板</h3>
          <p class="text-sm text-[var(--text-3)] max-w-xs">
            从左侧列表选择一个组织模板，编辑其详细描述和组织架构定义
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
