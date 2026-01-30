<script setup lang="ts">
import { Settings, Puzzle, Info, Moon, Sun } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ToggleButton from 'primevue/togglebutton';
import { ref } from 'vue';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();

const themeOptions = ref([
    { icon: Sun, value: 'light', label: '明亮' },
    { icon: Moon, value: 'dark', label: '暗黑' }
]);

const plugins = ref([
    { id: '1', name: 'Python 解释器', description: '允许智能体运行 Python 代码进行计算', status: 'active', version: '1.0.2' },
    { id: '2', name: 'Web 搜索', description: '赋予智能体搜索互联网的能力', status: 'active', version: '2.1.0' },
    { id: '3', name: '文件系统访问', description: '受限的本地文件读写权限', status: 'inactive', version: '0.9.5' },
]);

const togglePlugin = (plugin: any) => {
    plugin.status = plugin.status === 'active' ? 'inactive' : 'active';
};
</script>

<template>
  <div class="flex flex-col h-[500px] bg-transparent overflow-hidden rounded-b-xl text-[var(--text-1)]">
    <Tabs value="general" class="h-full flex flex-col">
        <TabList class="px-4 border-b border-[var(--border)]">
            <Tab value="general" class="flex items-center gap-2">
                <Settings class="w-4 h-4" />
                <span>常规设置</span>
            </Tab>
            <Tab value="plugins" class="flex items-center gap-2">
                <Puzzle class="w-4 h-4" />
                <span>插件管理</span>
            </Tab>
            <Tab value="about" class="flex items-center gap-2">
                <Info class="w-4 h-4" />
                <span>关于系统</span>
            </Tab>
        </TabList>

        <TabPanels class="flex-grow overflow-y-auto !p-0">
            <TabPanel value="general" class="p-6 space-y-8">
                <!-- 主题设置 -->
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

                <!-- 语言设置 -->
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

            <TabPanel value="plugins" class="p-6">
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

            <TabPanel value="about" class="p-6 flex flex-col items-center justify-center space-y-4">
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
  </div>
</template>
