<script setup lang="ts">
import { useOrgStore } from '../../stores/org';
import { useAppStore } from '../../stores/app';
import { useAgentStore } from '../../stores/agent';
import { onMounted, computed } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import { Sparkles, Users, Bot, User as UserIcon, ArrowRight } from 'lucide-vue-next';

const orgStore = useOrgStore();
const appStore = useAppStore();
const agentStore = useAgentStore();

// 获取除了首页之外的所有组织
const organizations = computed(() => orgStore.orgs.filter(o => o.id !== 'home'));

// 获取核心智能体 (root, user)
const coreAgents = computed(() => {
  const homeAgents = agentStore.agentsMap['home'] || [];
  return homeAgents.filter(a => a.id === 'root' || a.id === 'user');
});

onMounted(async () => {
  await orgStore.fetchOrgs();
  await agentStore.fetchAgentsByOrg('home');
});

const handleOrgClick = (org: any) => {
  appStore.openTab({
    id: org.id,
    type: 'org',
    title: org.name
  });
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

      <!-- 核心智能体区域 -->
      <section class="space-y-6">
        <div class="flex items-center space-x-2 px-2">
          <Sparkles class="w-5 h-5 text-[var(--primary)]" />
          <h2 class="text-lg font-bold text-[var(--text-1)]">核心节点</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            v-for="agent in coreAgents" 
            :key="agent.id"
            class="!bg-[var(--surface-1)] !border-[var(--border)] hover:!border-[var(--primary)] transition-all cursor-default overflow-hidden group"
          >
            <template #content>
              <div class="flex items-start space-x-4">
                <div class="w-12 h-12 rounded-xl bg-[var(--primary-weak)] flex items-center justify-center text-[var(--primary)] shrink-0 group-hover:scale-110 transition-transform">
                  <Bot v-if="agent.id === 'root'" class="w-6 h-6" />
                  <UserIcon v-else class="w-6 h-6" />
                </div>
                <div class="flex-grow min-w-0">
                  <div class="flex items-center justify-between">
                    <h3 class="font-bold text-[var(--text-1)] truncate">{{ agent.name }}</h3>
                  </div>
                  <p class="text-sm text-[var(--text-3)] mt-1 line-clamp-2">
                    {{ agent.id === 'root' ? '负责任务分解、资源调度与组织管理的核心智能体。' : '代表您的数字身份，是您在智能体社会中的化身。' }}
                  </p>
                </div>
              </div>
            </template>
          </Card>
        </div>
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
