<template>
  <div class="flex flex-col h-[600px] bg-transparent overflow-hidden rounded-b-xl text-[var(--text-1)]">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-[var(--primary)]" />
      <span class="ml-3 text-[var(--text-2)]">加载中...</span>
    </div>

    <div v-else-if="error" class="p-4">
      <Message severity="error">{{ error }}</Message>
    </div>

    <div v-else class="flex flex-col h-full">
      <Tabs value="info" class="flex-grow flex flex-col">
        <TabList class="px-4 border-b border-[var(--border)]">
          <Tab value="info" class="flex items-center gap-2">
            <Info class="w-4 h-4" />
            <span>基本信息</span>
          </Tab>
          <Tab value="prompt" class="flex items-center gap-2">
            <FileText class="w-4 h-4" />
            <span>岗位职责</span>
          </Tab>
          <Tab value="config" class="flex items-center gap-2">
            <Settings class="w-4 h-4" />
            <span>配置</span>
          </Tab>
        </TabList>

        <TabPanels class="flex-grow overflow-y-auto">
          <!-- 基本信息标签页 -->
          <TabPanel value="info" class="p-6 space-y-6">
            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                岗位ID
              </label>
              <div class="px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <code class="text-sm text-[var(--text-1)] font-mono">{{ roleData?.id }}</code>
              </div>
            </section>

            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                岗位名称
              </label>
              <div class="px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <span class="text-sm text-[var(--text-1)]">{{ roleData?.name }}</span>
              </div>
            </section>

            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                创建时间
              </label>
              <div class="px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <span class="text-sm text-[var(--text-1)]">{{ formatTimestamp(roleData?.createdAt) }}</span>
              </div>
            </section>

            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                创建者
              </label>
              <div class="px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <span class="text-sm text-[var(--text-1)]">{{ roleData?.createdBy || '系统' }}</span>
              </div>
            </section>
          </TabPanel>

          <!-- 岗位职责标签页 -->
          <TabPanel value="prompt" class="p-6 space-y-6">
            <section>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-[var(--text-1)]">
                  职责提示词
                </label>
                <Button
                  v-if="hasPromptChanges"
                  variant="text"
                  size="small"
                  @click="savePrompt"
                  :loading="savingPrompt"
                  class="!px-3 !py-1.5"
                >
                  <Check class="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
              <Textarea
                v-model="roleForm.rolePrompt"
                :rows="8"
                class="w-full"
                placeholder="描述该岗位的职责和任务..."
                :disabled="savingPrompt"
              />
              <p class="text-xs text-[var(--text-3)] mt-2">
                定义该岗位智能体的核心职责、任务范围和行为准则
              </p>
            </section>

            <section>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-[var(--text-1)]">
                  组织架构提示词
                </label>
                <Button
                  v-if="hasOrgPromptChanges"
                  variant="text"
                  size="small"
                  @click="saveOrgPrompt"
                  :loading="savingOrgPrompt"
                  class="!px-3 !py-1.5"
                >
                  <Check class="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
              <Textarea
                v-model="roleForm.orgPrompt"
                :rows="6"
                class="w-full"
                placeholder="定义该岗位在组织架构中的定位和协作方式（可选）..."
                :disabled="savingOrgPrompt"
              />
              <p class="text-xs text-[var(--text-3)] mt-2">
                可选：描述该岗位与其他岗位的协作关系、上下级关系等
              </p>
            </section>
          </TabPanel>

          <!-- 配置标签页 -->
          <TabPanel value="config" class="p-6 space-y-6">
            <section>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-[var(--text-1)]">
                  LLM 服务
                </label>
                <Button
                  v-if="hasLlmServiceChanges"
                  variant="text"
                  size="small"
                  @click="saveLlmService"
                  :loading="savingLlmService"
                  class="!px-3 !py-1.5"
                >
                  <Check class="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
              <Dropdown
                v-model="roleForm.llmServiceId"
                :options="llmServiceOptions"
                option-label="label"
                option-value="value"
                placeholder="使用默认LLM服务"
                class="w-full"
                :disabled="savingLlmService"
              />
              <p class="text-xs text-[var(--text-3)] mt-2">
                为该岗位指定专属的LLM服务，留空则使用系统默认服务
              </p>
            </section>

            <section>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-[var(--text-1)]">
                  工具组
                </label>
                <Button
                  v-if="hasToolGroupsChanges"
                  variant="text"
                  size="small"
                  @click="saveToolGroups"
                  :loading="savingToolGroups"
                  class="!px-3 !py-1.5"
                >
                  <Check class="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
              <MultiSelect
                v-model="roleForm.toolGroups"
                :options="toolGroupOptions"
                option-label="label"
                option-value="value"
                placeholder="使用全部工具组"
                class="w-full"
                :disabled="savingToolGroups"
              />
              <p class="text-xs text-[var(--text-3)] mt-2">
                限制该岗位智能体可使用的工具组，留空则允许使用所有工具
              </p>
            </section>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>

    <!-- 底部按钮栏 -->
    <div class="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-1)]">
      <div class="flex justify-end">
        <Button
          variant="text"
          @click="onClose"
          :disabled="saving"
        >
          关闭
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Dropdown from 'primevue/dropdown';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import { Info, FileText, Settings, Check, Loader2 } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import { apiService } from '../../services/api';

const toast = useToast();
const dialogRef = inject<any>('dialogRef');
const loading = ref(true);
const error = ref('');
const saving = ref(false);

// 获取从父组件传入的数据 - dialogRef 是一个 computed ref，需要访问 .value
const data = dialogRef?.value?.data || {};
const roleId = ref(data?.roleId || '');

// 调试日志
console.log('RoleDetailDialog - dialogRef:', dialogRef);
console.log('RoleDetailDialog - dialogRef.value:', dialogRef?.value);
console.log('RoleDetailDialog - data:', data);
console.log('RoleDetailDialog - roleId:', roleId.value);

// 岗位数据
const roleData = ref<any>(null);
const originalRoleData = ref<any>(null);

// 表单数据
const roleForm = ref({
  rolePrompt: '',
  orgPrompt: '',
  llmServiceId: null as string | null,
  toolGroups: [] as string[]
});

// 各字段保存状态
const savingPrompt = ref(false);
const savingOrgPrompt = ref(false);
const savingLlmService = ref(false);
const savingToolGroups = ref(false);

// LLM服务选项
const llmServiceOptions = ref<Array<{ label: string; value: string }>>([]);
const toolGroupOptions = ref<Array<{ label: string; value: string }>>([]);

// 检测变更
const hasPromptChanges = computed(() => {
  return roleForm.value.rolePrompt !== originalRoleData.value?.rolePrompt;
});

const hasOrgPromptChanges = computed(() => {
  const current = roleForm.value.orgPrompt || null;
  const original = originalRoleData.value?.orgPrompt || null;
  return current !== original;
});

const hasLlmServiceChanges = computed(() => {
  const current = roleForm.value.llmServiceId;
  const original = originalRoleData.value?.llmServiceId || null;
  return current !== original;
});

const hasToolGroupsChanges = computed(() => {
  const current = roleForm.value.toolGroups || [];
  const original = originalRoleData.value?.toolGroups || [];
  if (current.length !== original.length) return true;
  return !current.every((v, i) => v === original[i]);
});

// 格式化时间戳
const formatTimestamp = (timestamp: string | null) => {
  if (!timestamp) return '未知';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return timestamp;
  }
};

// 加载岗位详情
const loadRole = async () => {
  loading.value = true;
  error.value = '';

  // 调试日志
  console.log('loadRole - roleId.value:', roleId.value);
  console.log('loadRole - data:', data);

  try {
    const role = await apiService.getRole(roleId.value);
    roleData.value = role;
    originalRoleData.value = JSON.parse(JSON.stringify(role));

    // 填充表单数据
    roleForm.value = {
      rolePrompt: role.rolePrompt || '',
      orgPrompt: role.orgPrompt || '',
      llmServiceId: role.llmServiceId || null,
      toolGroups: role.toolGroups ? [...role.toolGroups] : []
    };
  } catch (err: any) {
    error.value = err.message || '加载岗位详情失败';
    console.error('加载岗位详情失败:', err);
  } finally {
    loading.value = false;
  }
};

// 加载LLM服务列表
const loadLlmServices = async () => {
  try {
    // 这里可以添加获取LLM服务列表的API调用
    // 暂时使用空数组
    llmServiceOptions.value = [];
  } catch (err) {
    console.error('加载LLM服务列表失败:', err);
  }
};

// 加载工具组列表
const loadToolGroups = async () => {
  try {
    const toolGroups = await apiService.getToolGroups();
    toolGroupOptions.value = toolGroups.map((tg: any) => ({
      label: tg.name || tg.id,
      value: tg.id
    }));
  } catch (err) {
    console.error('加载工具组列表失败:', err);
  }
};

// 保存职责提示词
const savePrompt = async () => {
  if (!hasPromptChanges.value || savingPrompt.value) return;

  savingPrompt.value = true;
  try {
    await apiService.updateRolePrompt(roleId.value, roleForm.value.rolePrompt);
    originalRoleData.value.rolePrompt = roleForm.value.rolePrompt;

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '职责提示词已更新',
      life: 3000
    });
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: err.message || '更新职责提示词失败',
      life: 5000
    });
  } finally {
    savingPrompt.value = false;
  }
};

// 保存组织架构提示词
const saveOrgPrompt = async () => {
  if (!hasOrgPromptChanges.value || savingOrgPrompt.value) return;

  savingOrgPrompt.value = true;
  try {
    await apiService.updateRolePrompt(roleId.value, roleForm.value.rolePrompt);
    // 同时更新 orgPrompt（需要后端支持）
    // 暂时跳过 orgPrompt 的单独更新
    originalRoleData.value.orgPrompt = roleForm.value.orgPrompt;

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '组织架构提示词已更新',
      life: 3000
    });
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: err.message || '更新组织架构提示词失败',
      life: 5000
    });
  } finally {
    savingOrgPrompt.value = false;
  }
};

// 保存LLM服务
const saveLlmService = async () => {
  if (!hasLlmServiceChanges.value || savingLlmService.value) return;

  savingLlmService.value = true;
  try {
    await apiService.updateRoleLlmService(roleId.value, roleForm.value.llmServiceId);
    originalRoleData.value.llmServiceId = roleForm.value.llmServiceId;

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: 'LLM服务配置已更新',
      life: 3000
    });
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: err.message || '更新LLM服务失败',
      life: 5000
    });
  } finally {
    savingLlmService.value = false;
  }
};

// 保存工具组
const saveToolGroups = async () => {
  if (!hasToolGroupsChanges.value || savingToolGroups.value) return;

  savingToolGroups.value = true;
  try {
    const toolGroups = roleForm.value.toolGroups.length > 0 ? roleForm.value.toolGroups : null;
    await apiService.updateRoleToolGroups(roleId.value, toolGroups);
    originalRoleData.value.toolGroups = toolGroups ? [...toolGroups] : [];

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '工具组配置已更新',
      life: 3000
    });
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: err.message || '更新工具组失败',
      life: 5000
    });
  } finally {
    savingToolGroups.value = false;
  }
};

// 关闭对话框
const onClose = () => {
  if (saving.value) return;
  // dialogRef 是通过 inject 获取的 ref，需要通过 .value 访问
  dialogRef?.value?.close?.();
};

onMounted(() => {
  loadRole();
  loadLlmServices();
  loadToolGroups();
});
</script>

<style scoped>
:deep(.p-dialog-content) {
  padding: 0;
}

:deep(.p-tablist) {
  background: transparent;
  border-bottom: 1px solid var(--border);
}

:deep(.p-tab) {
  padding: 12px 16px;
  color: var(--text-2);
  transition: all 0.2s;
}

:deep(.p-tab[data-p-active="true"]) {
  color: var(--primary);
  background: var(--surface-1);
  border-bottom: 2px solid var(--primary);
}

:deep(.p-tab:hover:not([data-p-active="true"])) {
  color: var(--text-1);
  background: var(--surface-3);
}

:deep(.p-tabpanel) {
  background: transparent;
}

:deep(.p-textarea) {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}

:deep(.p-dropdown),
:deep(.p-multiselect) {
  font-size: 14px;
}
</style>
