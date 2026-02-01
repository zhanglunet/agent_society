<script setup lang="ts">
/**
 * 系统设置对话框组件
 * 
 * 功能：提供系统配置管理，包括主题设置、LLM 配置编辑、LLM 服务管理
 * 
 * @author Agent Society
 */
import { ref, onMounted, computed, inject } from 'vue';
import { Settings, Puzzle, Info, Moon, Sun, Server, Key, Globe, Cpu, Save, Loader2, AlertCircle, X, Trash2, Plus } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ToggleButton from 'primevue/togglebutton';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import { useAppStore } from '../../stores/app';
import { configApi } from '../../services/configApi';
const appStore = useAppStore();

// 从 Dialog 注入获取数据
const dialogRef = inject<any>('dialogRef');
const dialogData = computed(() => dialogRef?.data);

// 是否为首次运行模式
const isFirstRun = computed(() => dialogData.value?.firstRun === true);

// 主题设置
const themeOptions = ref([
  { icon: Sun, value: 'light', label: '明亮' },
  { icon: Moon, value: 'dark', label: '暗黑' }
]);

// LLM 配置状态
const llmConfig = ref({
  baseURL: '',
  model: '',
  apiKey: '',
  maxTokens: 4096,
  maxConcurrentRequests: 2
});
const originalLlmConfig = ref({ ...llmConfig.value });
const llmLoading = ref(false);
const llmSaving = ref(false);
const llmError = ref('');
const llmSuccess = ref(false);

// LLM Services 状态
const llmServices = ref<any[]>([]);
const servicesLoading = ref(false);

// 服务编辑对话框状态
const serviceDialogVisible = ref(false);
const isEditingService = ref(false);
const serviceForm = ref({
  id: '',
  name: '',
  baseURL: '',
  model: '',
  apiKey: '',
  maxTokens: 4096,
  maxConcurrentRequests: 2,
  capabilityTags: [] as string[],
  description: '',
  capabilities: { input: ['text'], output: ['text'] }
});
const serviceTagInput = ref('');
const serviceSaving = ref(false);
const serviceError = ref('');

// 插件列表（示例数据）
const plugins = ref([
  { id: '1', name: 'Python 解释器', description: '允许智能体运行 Python 代码进行计算', status: 'active', version: '1.0.2' },
  { id: '2', name: 'Web 搜索', description: '赋予智能体搜索互联网的能力', status: 'active', version: '2.1.0' },
  { id: '3', name: '文件系统访问', description: '受限的本地文件读写权限', status: 'inactive', version: '0.9.5' },
]);

// 计算属性：LLM 配置是否有变更
const hasLlmChanges = computed(() => {
  return JSON.stringify(llmConfig.value) !== JSON.stringify(originalLlmConfig.value);
});

/**
 * 加载 LLM 配置
 */
const loadLlmConfig = async () => {
  llmLoading.value = true;
  llmError.value = '';
  try {
    const data = await configApi.getLlmConfig();
    llmConfig.value = {
      baseURL: data.llm.baseURL || '',
      model: data.llm.model || '',
      apiKey: data.llm.apiKey || '',
      maxTokens: data.llm.maxTokens || 4096,
      maxConcurrentRequests: data.llm.maxConcurrentRequests || 2
    };
    originalLlmConfig.value = { ...llmConfig.value };
  } catch (err) {
    llmError.value = err instanceof Error ? err.message : '加载配置失败';
  } finally {
    llmLoading.value = false;
  }
};

/**
 * 判断 API Key 是否为掩码格式
 */
const isMaskedApiKey = (key: string | undefined): boolean => {
  return !!key && key.startsWith('****');
};

/**
 * 保存 LLM 配置
 */
const saveLlmConfig = async () => {
  llmSaving.value = true;
  llmError.value = '';
  llmSuccess.value = false;
  
  try {
    // 构造保存数据，如果 apiKey 是掩码格式则不传递
    const saveData: any = {
      baseURL: llmConfig.value.baseURL,
      model: llmConfig.value.model,
      maxTokens: llmConfig.value.maxTokens,
      maxConcurrentRequests: llmConfig.value.maxConcurrentRequests
    };
    
    // 只有 apiKey 不是掩码格式时才传递
    if (!isMaskedApiKey(llmConfig.value.apiKey)) {
      saveData.apiKey = llmConfig.value.apiKey;
    }
    
    await configApi.saveLlmConfig(saveData);
    
    // 保存成功后，更新原始配置（保留掩码格式的 apiKey）
    originalLlmConfig.value = { ...llmConfig.value };
    llmSuccess.value = true;
    setTimeout(() => llmSuccess.value = false, 3000);
  } catch (err) {
    llmError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    llmSaving.value = false;
  }
};

/**
 * 重置 LLM 配置
 */
const resetLlmConfig = () => {
  llmConfig.value = { ...originalLlmConfig.value };
  llmError.value = '';
  llmSuccess.value = false;
};

/**
 * 切换插件状态
 */
const togglePlugin = (plugin: any) => {
  plugin.status = plugin.status === 'active' ? 'inactive' : 'active';
};

/**
 * 打开添加服务对话框
 */
const openAddServiceDialog = () => {
  isEditingService.value = false;
  serviceForm.value = {
    id: '',
    name: '',
    baseURL: 'http://127.0.0.1:1234/v1',
    model: '',
    apiKey: '',
    maxTokens: 4096,
    maxConcurrentRequests: 2,
    capabilityTags: ['文本对话'],
    description: '',
    capabilities: { input: ['text'], output: ['text'] }
  };
  serviceTagInput.value = '';
  serviceError.value = '';
  serviceDialogVisible.value = true;
};

/**
 * 打开编辑服务对话框
 */
const openEditServiceDialog = (service: any) => {
  isEditingService.value = true;
  serviceForm.value = {
    id: service.id || '',
    name: service.name || '',
    baseURL: service.baseURL || '',
    model: service.model || '',
    apiKey: service.apiKey || '',
    maxTokens: service.maxTokens || 4096,
    maxConcurrentRequests: service.maxConcurrentRequests || 2,
    capabilityTags: service.capabilityTags || [],
    description: service.description || '',
    capabilities: service.capabilities || { input: ['text'], output: ['text'] }
  };
  serviceTagInput.value = '';
  serviceError.value = '';
  serviceDialogVisible.value = true;
};

/**
 * 添加能力标签
 */
const addCapabilityTag = () => {
  const tag = serviceTagInput.value.trim();
  if (tag && !serviceForm.value.capabilityTags.includes(tag)) {
    serviceForm.value.capabilityTags.push(tag);
  }
  serviceTagInput.value = '';
};

/**
 * 移除能力标签
 */
const removeCapabilityTag = (tag: string) => {
  const index = serviceForm.value.capabilityTags.indexOf(tag);
  if (index > -1) {
    serviceForm.value.capabilityTags.splice(index, 1);
  }
};

/**
 * 判断 API Key 是否为掩码格式
 */
const isServiceApiKeyMasked = (key: string | undefined): boolean => {
  return !!key && key.startsWith('****');
};

/**
 * 保存服务
 */
const saveService = async () => {
  serviceSaving.value = true;
  serviceError.value = '';
  
  try {
    // 验证必填字段
    if (!serviceForm.value.id.trim()) {
      throw new Error('服务 ID 不能为空');
    }
    if (!serviceForm.value.name.trim()) {
      throw new Error('服务名称不能为空');
    }
    if (!serviceForm.value.baseURL.trim()) {
      throw new Error('API 地址不能为空');
    }
    if (!serviceForm.value.model.trim()) {
      throw new Error('模型名称不能为空');
    }
    
    // 构造保存数据
    const saveData: any = {
      id: serviceForm.value.id.trim(),
      name: serviceForm.value.name.trim(),
      baseURL: serviceForm.value.baseURL.trim(),
      model: serviceForm.value.model.trim(),
      maxTokens: serviceForm.value.maxTokens,
      maxConcurrentRequests: serviceForm.value.maxConcurrentRequests,
      capabilityTags: serviceForm.value.capabilityTags,
      description: serviceForm.value.description.trim(),
      capabilities: serviceForm.value.capabilities
    };
    
    // 只有 apiKey 不是掩码格式时才传递
    if (!isServiceApiKeyMasked(serviceForm.value.apiKey)) {
      saveData.apiKey = serviceForm.value.apiKey;
    }
    
    if (isEditingService.value) {
      await configApi.updateLlmService(serviceForm.value.id, saveData);
    } else {
      await configApi.addLlmService(saveData);
    }
    
    // 保存成功后刷新列表
    await loadLlmServices();
    serviceDialogVisible.value = false;
  } catch (err) {
    serviceError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    serviceSaving.value = false;
  }
};

/**
 * 删除服务
 */
const deleteService = async (serviceId: string) => {
  if (!confirm('确定要删除此服务吗？')) {
    return;
  }
  
  try {
    await configApi.deleteLlmService(serviceId);
    await loadLlmServices();
  } catch (err) {
    alert(err instanceof Error ? err.message : '删除失败');
  }
};

/**
 * 加载 LLM 服务列表
 */
const loadLlmServices = async () => {
  servicesLoading.value = true;
  try {
    const data = await configApi.getLlmServicesConfig();
    llmServices.value = data.services || [];
  } catch (err) {
    console.warn('加载 LLM 服务列表失败:', err);
    llmServices.value = [];
  } finally {
    servicesLoading.value = false;
  }
};

// 组件挂载时加载配置
onMounted(() => {
  loadLlmConfig();
  loadLlmServices();
});
</script>

<template>
  <div class="flex flex-col h-[600px] bg-transparent overflow-hidden rounded-b-xl text-[var(--text-1)]">
    <Tabs value="llm" class="h-full flex flex-col">
      <TabList class="px-4 border-b border-[var(--border)]">
        <!-- 首次运行时只显示 LLM 配置标签 -->
        <Tab v-if="!isFirstRun" value="general" class="flex items-center gap-2">
          <Settings class="w-4 h-4" />
          <span>常规设置</span>
        </Tab>
        <Tab value="llm" class="flex items-center gap-2">
          <Server class="w-4 h-4" />
          <span>大模型配置</span>
        </Tab>
        <Tab v-if="!isFirstRun" value="services" class="flex items-center gap-2">
          <Cpu class="w-4 h-4" />
          <span>模型服务</span>
        </Tab>
        <Tab v-if="!isFirstRun" value="plugins" class="flex items-center gap-2">
          <Puzzle class="w-4 h-4" />
          <span>插件管理</span>
        </Tab>
        <Tab v-if="!isFirstRun" value="about" class="flex items-center gap-2;">
          <Info class="w-4 h-4" />
          <span>关于系统</span>
        </Tab>
      </TabList>

      <TabPanels class="flex-grow overflow-y-auto !p-0">
        <!-- 常规设置 -->
        <TabPanel v-if="!isFirstRun" value="general" class="p-6 space-y-8">
          <section>
            <h3 class="text-sm font-bold text-[var(--text-1)] mb-4 flex items-center gap-2">
              外观展示
            </h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <div>
                  <p class="font-medium text-[var(--text-1)]">深色模式</p>
                  <p class="text-xs text-[var(--text-3)]">调整应用界面的显示主题</p>
                </div>
                <div class="flex items-center gap-2">
                  <Button 
                    v-for="opt in themeOptions" 
                    :key="opt.value"
                    :variant="appStore.theme === opt.value ? 'primary' : 'text'"
                    size="small"
                    @click="appStore.setTheme(opt.value as any)"
                    class="!px-3 !py-1.5"
                    :class="[appStore.theme === opt.value ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-2)]']"
                  >
                    <component :is="opt.icon" class="w-4 h-4 mr-2" />
                    {{ opt.label }}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-[var(--text-1)] mb-4">偏好设置</h3>
            <div class="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              <div>
                <p class="font-medium text-[var(--text-1)]">自动保存</p>
                <p class="text-xs text-[var(--text-3)]">离开页面时自动保存未发送的消息草稿</p>
              </div>
              <ToggleButton onLabel="开启" offLabel="关闭" class="!w-20" />
            </div>
          </section>
        </TabPanel>

        <!-- LLM 配置 -->
        <TabPanel value="llm" class="p-6 space-y-6">
          <!-- 首次运行提示 -->
          <div v-if="isFirstRun" class="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
            <AlertCircle class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-blue-700">首次运行配置</p>
              <p class="text-sm text-blue-600 mt-1">
                这是您第一次运行系统。请配置大模型参数后保存，系统将创建 app.local.json 配置文件。
                配置保存后系统将自动连接大模型服务。
              </p>
            </div>
          </div>

          <!-- 状态提示 -->
          <Message v-if="llmError" severity="error" class="mb-4">{{ llmError }}</Message>
          <Message v-if="llmSuccess" severity="success" class="mb-4">配置已保存到 app.local.json</Message>

          <!-- 加载状态 -->
          <div v-if="llmLoading" class="flex items-center justify-center py-12">
            <Loader2 class="w-6 h-6 animate-spin text-[var(--text-3)]" />
          </div>

          <!-- 配置表单 -->
          <div v-else class="space-y-6">
            <!-- 服务地址 -->
            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                <Globe class="w-4 h-4 inline-block mr-1" />
                API 地址
              </label>
              <InputText
                v-model="llmConfig.baseURL"
                placeholder="http://127.0.0.1:1234/v1"
                class="w-full"
              />
              <p class="text-xs text-[var(--text-3)] mt-1">
                大模型服务的 API 地址，支持 OpenAI 兼容格式
              </p>
            </section>

            <!-- 模型名称 -->
            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                <Server class="w-4 h-4 inline-block mr-1" />
                模型名称
              </label>
              <InputText
                v-model="llmConfig.model"
                placeholder="model-name"
                class="w-full"
              />
              <p class="text-xs text-[var(--text-3)] mt-1">
                要使用的模型标识符
              </p>
            </section>

            <!-- API Key -->
            <section>
              <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                <Key class="w-4 h-4 inline-block mr-1" />
                API Key
              </label>
              <InputText
                v-model="llmConfig.apiKey"
                placeholder="sk-..."
                type="password"
                class="w-full"
              />
              <p class="text-xs text-[var(--text-3)] mt-1">
                访问大模型服务的密钥，本地部署可填 NOT_NEEDED
              </p>
            </section>

            <!-- 高级设置 -->
            <section class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                  最大 Token 数
                </label>
                <InputNumber
                  v-model="llmConfig.maxTokens"
                  :min="1"
                  :max="128000"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-[var(--text-1)] mb-2">
                  最大并发请求
                </label>
                <InputNumber
                  v-model="llmConfig.maxConcurrentRequests"
                  :min="1"
                  :max="10"
                  class="w-full"
                />
              </div>
            </section>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
              <Button
                variant="primary"
                :disabled="!hasLlmChanges || llmSaving"
                :loading="llmSaving"
                @click="saveLlmConfig"
              >
                <Save class="w-4 h-4 mr-2" />
                保存配置
              </Button>
              <Button
                variant="text"
                :disabled="!hasLlmChanges || llmSaving"
                @click="resetLlmConfig"
              >
                重置
              </Button>
              <span v-if="hasLlmChanges" class="text-xs text-orange-500 ml-auto">
                有未保存的修改
              </span>
            </div>
          </div>
        </TabPanel>

        <!-- LLM 服务管理 -->
        <TabPanel v-if="!isFirstRun" value="services" class="p-6">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-[var(--text-1)]">模型服务列表</h3>
              <Button variant="text" size="small" @click="openAddServiceDialog">
                <Plus class="w-4 h-4 mr-1" />
                添加服务
              </Button>
            </div>
            
            <div v-if="servicesLoading" class="flex items-center justify-center py-12">
              <Loader2 class="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
            
            <div v-else class="grid grid-cols-1 gap-4">
              <div 
                v-for="service in llmServices" 
                :key="service.id"
                class="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-[var(--surface-3)] flex items-center justify-center text-[var(--primary)]">
                      <Cpu class="w-5 h-5" />
                    </div>
                    <div>
                      <p class="font-medium text-[var(--text-1)]">{{ service.name }}</p>
                      <p class="text-xs text-[var(--text-3)]">{{ service.id }}</p>
                      <p v-if="service.description" class="text-xs text-[var(--text-3)] mt-1 max-w-[300px] truncate">{{ service.description }}</p>
                      <div class="flex gap-1 mt-1.5">
                        <span 
                          v-for="tag in service.capabilityTags?.slice(0, 3)" 
                          :key="tag"
                          class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--primary-weak)] text-[var(--primary)]"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button variant="text" size="small" @click="openEditServiceDialog(service)">
                      编辑
                    </Button>
                    <Button variant="text" size="small" class="text-red-500" @click="deleteService(service.id)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div v-if="llmServices.length === 0" class="text-center py-12 text-[var(--text-3)]">
                <Cpu class="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>暂无自定义模型服务</p>
                <p class="text-xs mt-1">点击上方按钮添加</p>
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- 插件管理 -->
        <TabPanel v-if="!isFirstRun" value="plugins" class="p-6">
          <div class="grid grid-cols-1 gap-4">
            <div v-for="plugin in plugins" :key="plugin.id" 
                 class="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-start justify-between">
              <div class="flex gap-4">
                <div class="w-10 h-10 rounded-lg bg-[var(--surface-3)] flex items-center justify-center text-[var(--primary)]">
                  <Puzzle class="w-5 h-5" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-[var(--text-1)]">{{ plugin.name }}</p>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-3)]">v{{ plugin.version }}</span>
                  </div>
                  <p class="text-xs text-[var(--text-3)] mt-1">{{ plugin.description }}</p>
                </div>
              </div>
              <Button 
                :variant="plugin.status === 'active' ? 'text' : 'primary'"
                size="small"
                @click="togglePlugin(plugin)"
                :class="[plugin.status === 'active' ? 'text-red-500 hover:bg-red-50' : 'bg-[var(--primary)] text-white']"
              >
                {{ plugin.status === 'active' ? '禁用' : '启用' }}
              </Button>
            </div>
          </div>
        </TabPanel>

        <!-- 关于系统 -->
        <TabPanel v-if="!isFirstRun" value="about" class="p-6 flex flex-col items-center justify-center space-y-4;">
          <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] flex items-center justify-center shadow-lg shadow-[var(--primary-weak)]">
            <span class="text-white text-3xl font-bold">AS</span>
          </div>
          <div class="text-center">
            <h2 class="text-xl font-bold text-[var(--text-1)]">Agent Society</h2>
            <p class="text-sm text-[var(--text-3)]">版本 1.0.0-alpha</p>
          </div>
          <p class="text-sm text-center text-[var(--text-2)] max-w-[300px] leading-relaxed">
            一个基于大模型的智能体自组织社会化系统，致力于探索智能体协作的新边界。
          </p>
          <div class="pt-4 flex gap-4">
            <Button label="检查更新" variant="text" size="small" />
            <Button label="用户手册" variant="text" size="small" />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- 服务编辑对话框 -->
    <Dialog
      v-model:visible="serviceDialogVisible"
      :header="isEditingService ? '编辑服务' : '添加服务'"
      :style="{ width: '520px' }"
      :modal="true"
      :closable="!serviceSaving"
      pt:content:class="!p-0"
    >
      <div class="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
        <!-- 错误提示 -->
        <Message v-if="serviceError" severity="error">{{ serviceError }}</Message>

        <!-- 服务 ID -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            服务 ID <span class="text-red-500">*</span>
          </label>
          <InputText
            v-model="serviceForm.id"
            placeholder="my-service"
            class="w-full"
            :disabled="isEditingService"
          />
          <p class="text-xs text-[var(--text-3)] mt-1">
            唯一标识符，保存后不可修改
          </p>
        </section>

        <!-- 服务名称 -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            服务名称 <span class="text-red-500">*</span>
          </label>
          <InputText
            v-model="serviceForm.name"
            placeholder="我的服务"
            class="w-full"
          />
        </section>

        <!-- API 地址 -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            API 地址 <span class="text-red-500">*</span>
          </label>
          <InputText
            v-model="serviceForm.baseURL"
            placeholder="http://127.0.0.1:1234/v1"
            class="w-full"
          />
        </section>

        <!-- 模型名称 -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            模型名称 <span class="text-red-500">*</span>
          </label>
          <InputText
            v-model="serviceForm.model"
            placeholder="model-name"
            class="w-full"
          />
        </section>

        <!-- API Key -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            API Key
          </label>
          <InputText
            v-model="serviceForm.apiKey"
            placeholder="sk-..."
            type="password"
            class="w-full"
          />
          <p class="text-xs text-[var(--text-3)] mt-1">
            {{ isEditingService ? '留空表示不修改原值' : '本地部署可填写 NOT_NEEDED' }}
          </p>
        </section>

        <!-- 高级设置 -->
        <section class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
              最大 Token 数
            </label>
            <InputNumber
              v-model="serviceForm.maxTokens"
              :min="1"
              :max="128000"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
              最大并发请求
            </label>
            <InputNumber
              v-model="serviceForm.maxConcurrentRequests"
              :min="1"
              :max="10"
              class="w-full"
            />
          </div>
        </section>

        <!-- 能力标签 -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            能力标签
          </label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="tag in serviceForm.capabilityTags"
              :key="tag"
              class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--primary-weak)] text-[var(--primary)]"
            >
              {{ tag }}
              <button @click="removeCapabilityTag(tag)" class="hover:text-red-500">
                <X class="w-3 h-3" />
              </button>
            </span>
          </div>
          <div class="flex gap-2">
            <InputText
              v-model="serviceTagInput"
              placeholder="输入标签后按回车"
              class="flex-1"
              @keydown.enter.prevent="addCapabilityTag"
            />
            <Button variant="text" size="small" @click="addCapabilityTag">
              <Plus class="w-4 h-4" />
            </Button>
          </div>
        </section>

        <!-- 描述 -->
        <section>
          <label class="block text-sm font-medium text-[var(--text-1)] mb-1.5">
            描述
          </label>
          <Textarea
            v-model="serviceForm.description"
            placeholder="服务描述..."
            rows="2"
            class="w-full resize-none"
          />
        </section>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2 px-6 py-3">
          <Button
            variant="text"
            :disabled="serviceSaving"
            @click="serviceDialogVisible = false"
          >
            取消
          </Button>
          <Button
            variant="primary"
            :loading="serviceSaving"
            @click="saveService"
          >
            <Save class="w-4 h-4 mr-1" />
            {{ isEditingService ? '保存' : '添加' }}
          </Button>
        </div>
      </template>
    </Dialog>
  </div>
</template>
