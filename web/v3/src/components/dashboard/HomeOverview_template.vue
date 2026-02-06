<template>
  <div class="h-full overflow-y-auto bg-[var(--bg)] p-8">
    <div class="max-w-6xl mx-auto space-y-12">
      <!-- 欢迎区域 -->
      <section class="text-center space-y-4">
        <h1 class="text-3xl font-bold text-[var(--text-1)] tracking-tight">智能体社会化系统</h1>
        <p class="text-[var(--text-3)] max-w-2xl mx-auto">
          *~欢迎回到 Agent Society!~*<br/><br/>
          在这里，智能体像人类一样形成自组织的社会性团体，协助您完成复杂任务。
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
              <!-- 嵌入式聊天区域 -->
              <div v-if="showChat" 
                class="chat-expand-animation border border-[var(--border)] rounded-xl bg-[var(--surface-2)] overflow-hidden mb-4"
              >
                <!-- 聊天头部工具栏 -->
                <div class="flex items-center justify-end px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-1)]">
                  <Button 
                    variant="text" 
                    rounded 
                    class="!p-1.5 !text-[var(--text-3)] hover:!bg-[var(--surface-3)] ml-1"
                    @click="closeChat"
                    title="关闭对话"
                  >
                    <X class="w-4 h-4" />
                  </Button>
                </div>
                <div 
                  ref="chatContainer"
                  class="p-4 overflow-y-auto"
                  style="max-height: 50vh; min-height: 100px;"
                >
                  <ChatMessageList agent-id="root" only-current-session />
                  
                  <!-- 初始占位/加载状态 -->
                  <div v-if="rootMessages.length === 0" class="flex justify-center py-8">
                    <div class="flex items-center space-x-2 text-[var(--text-3)] text-sm">
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce"></div>
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      <span>正在规划您的团队...</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-3 relative">
                <!-- 非阻塞设计：输入区域容器 -->
                <div class="input-area-container relative flex-grow">
                  <div class="relative flex-grow">
                    <Textarea 
                      v-model="newGoal" 
                      autoResize 
                      rows="1"
                      placeholder="输入一个目标或者任务，我为你创造一个团队" 
                      class="w-full !bg-[var(--surface-2)] !border-[var(--border)] focus:!border-[var(--primary)] !pl-4 !pr-14 !py-3 !rounded-xl !resize-none min-h-[52px]"
                      @keydown="handleKeyDown"
                    />
                  </div>
                  <div class="absolute right-3 bottom-3.5 flex items-center">
                    <Button 
                      ref="sendButtonRef"
                      @click="createOrganization"
                      :loading="isCreating"
                      class="!w-9 !h-9 !rounded-lg !bg-[var(--primary)] !border-none !text-white hover:!brightness-110 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <template #loadingicon>
                        <Loader2 class="w-4 h-4 animate-spin" />
                      </template>
                      <template #icon>
                        <Send v-if="!isCreating" class="w-4 h-4" />
                      </template>
                    </Button>
                  </div>

                  <!-- 发送按钮引导气泡 -->
                  <div class="guide-bubble-container guide-bubble-container--send">
                    <GuideBubble
                      v-if="showGuideBubble"
                      :visible="showGuideBubble"
                      position="bottom"
                      :offset="{ x: 0, y: 0 }"
                      title="开始使用"
                      :text="'我已经在输入框里为您准备好了创建私人助理的命令，点击发送按钮即可开始。'"
                      :hint="'您也可以修改文字内容，或者关闭此提示。'"
                      icon="rocket"
                      :show-close-button="true"
                      @close="guideStore.hideGuide()"
                    />
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
