<script setup lang="ts">
import { useOrgStore } from '../../stores/org';
import { useAppStore } from '../../stores/app';
import { useChatStore } from '../../stores/chat';
import { ref, onMounted, computed } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { Sparkles, Users, ArrowRight, Send } from 'lucide-vue-next';

const orgStore = useOrgStore();
const appStore = useAppStore();
const chatStore = useChatStore();

const newGoal = ref('');
const isCreating = ref(false);

// 获取除了首页之外的所有组织
const organizations = computed(() => orgStore.orgs.filter(o => o.id !== 'home'));

onMounted(async () => {
  await orgStore.fetchOrgs();
});

const handleOrgClick = (org: any) => {
  appStore.openTab({
    id: org.id,
    type: 'org',
    title: org.name
  });
};

const createOrganization = async () => {
  if (!newGoal.value.trim() || isCreating.value) return;
  
  isCreating.value = true;
  try {
    // 创造一个团队的逻辑：发送消息给 root
    // 这里我们先打开 root 的对话框，并发送初始目标
    appStore.openTab({
      id: 'home',
      type: 'org',
      title: '首页'
    });
    
    // 设置活跃智能体为 root
     await chatStore.setActiveAgent('home', 'root');
     
     // 发送消息
     await chatStore.sendMessage('root', newGoal.value, 'user');
    
    newGoal.value = '';
  } catch (error) {
    console.error('创建组织失败:', error);
  } finally {
    isCreating.value = false;
  }
};
</script>

<template>
  <div class="h-full overflow-y-auto bg-[var(--bg)] p-8">
    <div class="max-w-6xl mx-auto space-y-12">
      <!-- 欢迎区域 -->
      <section class="text-center space-y-4">
        <h1 class="text-3xl font-bold text-[var(--text-1)] tracking-tight">智能体社会化系统</h1>
        <p class="text-[var(--text-3)] max-w-2xl mx-auto">
          欢迎回到 Agent Society。在这里，智能体像人类一样形成自组织的社会性团体，协助您完成复杂任务。
        </p>
      </section>

      <!-- 创建新组织区域 -->
      <section class="space-y-6">
        <div class="flex items-center space-x-2 px-2">
          <Sparkles class="w-5 h-5 text-[var(--primary)]" />
          <h2 class="text-lg font-bold text-[var(--text-1)]">创建新组织</h2>
        </div>
        
        <Card class="!bg-[var(--surface-1)] !border-[var(--border)] overflow-hidden">
          <template #content>
            <div class="space-y-4">
              <div class="flex items-center space-x-3">
                <div class="relative flex-grow">
                  <InputText 
                    v-model="newGoal" 
                    placeholder="输入一个目标或者任务，我为你创造一个团队" 
                    class="w-full !bg-[var(--surface-2)] !border-[var(--border)] focus:!border-[var(--primary)] !pl-4 !pr-12 !py-3 !rounded-xl"
                    @keyup.enter="createOrganization"
                  />
                  <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                    <Button 
                      icon="pi pi-arrow-right" 
                      @click="createOrganization"
                      :loading="isCreating"
                      class="!w-8 !h-8 !rounded-lg !bg-[var(--primary)] !border-none !text-white hover:!bg-[var(--primary-hover)] transition-colors"
                    >
                      <template #icon>
                        <Send v-if="!isCreating" class="w-4 h-4" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </section>

      <!-- 组织平铺区域 -->
      <section class="space-y-6">
        <div class="flex items-center space-x-2 px-2">
          <Users class="w-5 h-5 text-[var(--primary)]" />
          <h2 class="text-lg font-bold text-[var(--text-1)]">所有组织</h2>
        </div>
        
        <div v-if="orgStore.loading" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div v-for="i in 4" :key="i" class="h-32 rounded-2xl bg-[var(--surface-2)] animate-pulse"></div>
        </div>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Card 
            v-for="org in organizations" 
            :key="org.id"
            class="!bg-[var(--surface-1)] !border-[var(--border)] hover:!border-[var(--primary)] hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
            @click="handleOrgClick(org)"
          >
            <template #content>
              <div class="flex flex-col items-start text-left space-y-4 pt-2">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-weak)] to-[var(--surface-3)] flex items-center justify-center text-2xl font-bold text-[var(--primary)] group-hover:rotate-6 transition-transform">
                  {{ org.initial }}
                </div>
                <div class="flex-grow min-w-0 w-full">
                  <div class="flex items-center justify-between">
                    <h3 class="font-bold text-[var(--text-1)] truncate group-hover:text-[var(--primary)] transition-colors">{{ org.name }}</h3>
                  </div>
                  <p class="text-xs text-[var(--text-3)] mt-1 line-clamp-1">{{ org.role }}</p>
                </div>
                <div class="pt-2">
                  <Button size="small" variant="text" class="!text-[var(--primary)] !p-0">
                    <span class="text-xs font-bold mr-1">进入组织</span>
                    <ArrowRight class="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
:deep(.p-card) {
  border-radius: 1.25rem;
}
:deep(.p-card-body) {
  padding: 1.5rem;
}
</style>
