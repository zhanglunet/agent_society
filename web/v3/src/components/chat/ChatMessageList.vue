<script setup lang="ts">
import { ref, computed } from 'vue';
import { User, Bot, Sparkles, Wrench, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { useChatStore } from '../../stores/chat';
import { useAgentStore } from '../../stores/agent';
import { useAppStore } from '../../stores/app';
import { useOrgStore } from '../../stores/org';

const props = defineProps<{
  agentId: string;
  orgId?: string;
  // 是否只显示当前会话的消息（过滤掉旧消息）
  onlyCurrentSession?: boolean;
}>();

const chatStore = useChatStore();
const agentStore = useAgentStore();
const appStore = useAppStore();
const orgStore = useOrgStore();

const expandedToolCalls = ref<Record<string, boolean>>({});
const expandedReasoning = ref<Record<string, boolean>>({});
const expandedGroups = ref<Record<string, boolean>>({});

// 悬停详情
const hoveredAgentId = ref<string | null>(null);
const tooltipPosition = ref({ x: 0, y: 0 });
const tooltipTimer = ref<any>(null);

// Token tooltip 状态
const tokenTooltip = ref<{
  show: boolean;
  x: number;
  y: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}>({ show: false, x: 0, y: 0, usage: null });

const showTokenTooltip = (event: MouseEvent, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => {
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  tokenTooltip.value = {
    show: true,
    x: rect.left + rect.width / 2,
    y: rect.bottom + 4,
    usage
  };
};

const hideTokenTooltip = () => {
  tokenTooltip.value.show = false;
};



const handleMouseEnter = (event: MouseEvent, agentId: string) => {
  if (agentId === 'user' || agentId === 'system') return;
  
  // 清除之前的定时器
  if (tooltipTimer.value) clearTimeout(tooltipTimer.value);
  
  // 设置延迟显示，避免快速划过时闪烁
  tooltipTimer.value = setTimeout(() => {
    hoveredAgentId.value = agentId;
    // 获取元素位置，让 tooltip 出现在元素上方
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    tooltipPosition.value = {
      x: rect.left + rect.width / 2,
      y: rect.top
    };
  }, 400);
};

const handleMouseLeave = () => {
  if (tooltipTimer.value) clearTimeout(tooltipTimer.value);
  hoveredAgentId.value = null;
};

const hoveredAgent = computed(() => {
  if (!hoveredAgentId.value) return null;
  return findAgentById(hoveredAgentId.value);
});

const toggleGroup = (groupId: string) => {
  expandedGroups.value[groupId] = !expandedGroups.value[groupId];
};

const toggleToolCall = (msgId: string) => {
  expandedToolCalls.value[msgId] = !expandedToolCalls.value[msgId];
};

const parseJson = (str: any) => {
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return str;
  }
};

const toggleReasoning = (msgId: string) => {
  expandedReasoning.value[msgId] = !expandedReasoning.value[msgId];
};

const currentMessages = computed(() => {
  let msgs = props.onlyCurrentSession 
    ? chatStore.getSessionMessages(props.agentId)
    : (chatStore.chatMessages[props.agentId] || []);
  
  let filteredMsgs = msgs;
  
  // 如果当前是 user 视图，过滤出与当前组织成员相关的消息
  if (props.agentId === 'user' && props.orgId) {
    const orgAgentIds = (agentStore.agentsMap[props.orgId] || [])
      .map(a => a.id)
      .filter(id => id !== 'user');

    filteredMsgs = msgs.filter(m => {
      const isFromOrgAgent = m.senderId !== 'user' && orgAgentIds.includes(m.senderId);
      const isToOrgAgent = m.receiverId && orgAgentIds.includes(m.receiverId);
      return isFromOrgAgent || isToOrgAgent;
    });
  }
  
  // 处理连续的函数调用折叠逻辑
  const groupedMsgs: any[] = [];
  let currentGroup: any = null;

  filteredMsgs.forEach((msg) => {
    const isToolCall = !!msg.toolCall;
    
    if (isToolCall) {
      if (!currentGroup) {
        currentGroup = {
          id: `group-${msg.id}`,
          type: 'tool-group',
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          senderType: msg.senderType,
          timestamp: msg.timestamp,
          messages: [msg]
        };
        groupedMsgs.push(currentGroup);
      } else if (currentGroup.senderId === msg.senderId && currentGroup.receiverId === msg.receiverId) {
        currentGroup.messages.push(msg);
      } else {
        currentGroup = {
          id: `group-${msg.id}`,
          type: 'tool-group',
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          senderType: msg.senderType,
          timestamp: msg.timestamp,
          messages: [msg]
        };
        groupedMsgs.push(currentGroup);
      }
    } else {
      currentGroup = null;
      groupedMsgs.push(msg);
    }
  });
  
  // 标记每条消息是否是该发送者连续消息中的最后一条（用于控制 token 显示）
  for (let i = 0; i < groupedMsgs.length; i++) {
    const current = groupedMsgs[i];
    const next = groupedMsgs[i + 1];
    
    // 获取发送者ID（tool-group 和普通消息都兼容）
    const currentSender = current.type === 'tool-group' ? current.senderId : current.senderId;
    const nextSender = next ? (next.type === 'tool-group' ? next.senderId : next.senderId) : null;
    
    // 如果下一条不存在，或者下一条发送者不同，则是最后一条
    current._isLastInGroup = !next || currentSender !== nextSender;
  }
  
  return groupedMsgs;
});

const getSenderName = (msg: any) => {
  if (msg.senderType === 'user') return '我';
  const agent = findAgentById(msg.senderId);
  return agent ? agent.name : msg.senderId;
};

const getReceiverName = (msg: any) => {
  if (!msg.receiverId) return null;
  if (msg.receiverId === 'user') return '我';
  const agent = findAgentById(msg.receiverId);
  return agent ? agent.name : msg.receiverId;
};

const findAgentById = (id: string) => {
  // 1. 先从全局列表中找（最全，支持跨组织）
  const globalAgent = agentStore.allAgents.find(a => a.id === id);
  if (globalAgent) return globalAgent;

  // 2. 兜底：从各组织 Map 中找
  for (const orgId in agentStore.agentsMap) {
    const agents = agentStore.agentsMap[orgId];
    if (agents) {
      const agent = agents.find(a => a.id === id);
      if (agent) return agent;
    }
  }
  return null;
};

/**
 * 跳转到指定智能体的对话位置
 */
const navigateToMessage = (agentId: string, messageId: string) => {
  let targetOrgId = '';
  let targetAgentId = agentId;

  if (agentId === 'user') {
    // 如果点击的是 user，优先跳转到当前组件所属的组织（保持上下文）
    targetOrgId = props.orgId || 'home';
  } else {
    // 如果点击的是智能体，通过智能体信息定位组织
    const agent = findAgentById(agentId);
    if (!agent) return;
    targetOrgId = agent.orgId;
  }

  // 设置待滚动消息 ID
  chatStore.pendingScrollMessageId = messageId;
  
  // 切换智能体和组织
  chatStore.setActiveAgent(targetOrgId, targetAgentId);
  
  // 确定组织名称
  let orgName = targetOrgId === 'home' ? '首页' : '组织';
  
  // 优先从已打开的标签中找名称
  const existingTab = appStore.activeTabs.find(t => t.id === targetOrgId);
  if (existingTab) {
    orgName = existingTab.title;
  } else {
    // 其次从组织仓库中找名称
    const org = orgStore.orgs.find(o => o.id === targetOrgId);
    if (org) orgName = org.name;
  }

  // 打开或切换标签页
  appStore.openTab({
    id: targetOrgId,
    type: 'org',
    title: orgName
  });
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * 计算工具调用组的总 Token 数
 */
const getGroupTotalTokens = (messages: any[]): number => {
  return messages.reduce((sum: number, m: any) => sum + (m.usage?.totalTokens || 0), 0);
};

/**
 * 计算工具调用组的总输入 Token 数
 */
const getGroupPromptTokens = (messages: any[]): number => {
  return messages.reduce((sum: number, m: any) => sum + (m.usage?.promptTokens || 0), 0);
};

/**
 * 计算工具调用组的总输出 Token 数
 */
const getGroupCompletionTokens = (messages: any[]): number => {
  return messages.reduce((sum: number, m: any) => sum + (m.usage?.completionTokens || 0), 0);
};
</script>

<template>
  <div class="space-y-6">
    <template v-for="item in currentMessages" :key="item.id">
      <!-- 普通消息 -->
      <div 
        v-if="item.type !== 'tool-group'"
        :id="'msg-' + item.id"
        class="flex group"
        :class="item.senderType === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div 
          class="flex max-w-[90%] items-start space-x-3"
          :class="item.senderType === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'"
        >
          <!-- 头像 -->
          <div class="w-8 h-8 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <User v-if="item.senderType === 'user'" class="w-4 h-4 text-[var(--text-2)]" />
            <Bot v-else class="w-4 h-4 text-[var(--primary)]" />
          </div>

          <!-- 消息气泡 -->
          <div class="flex flex-col min-w-0" :class="item.senderType === 'user' ? 'items-end' : 'items-start'">
            <div class="flex items-center space-x-2 mb-1 px-1">
              <div class="flex items-center space-x-1 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <span 
                  class="hover:text-[var(--primary)] cursor-pointer transition-colors"
                  @click="navigateToMessage(item.senderId, item.id)"
                  @mouseenter="handleMouseEnter($event, item.senderId)"
                  @mouseleave="handleMouseLeave"
                >{{ getSenderName(item) }}</span>
                <template v-if="getReceiverName(item)">
                  <span class="opacity-50 mx-1">→</span>
                  <span 
                    class="hover:text-[var(--primary)] cursor-pointer transition-colors"
                    @click="navigateToMessage(item.receiverId, item.id)"
                    @mouseenter="handleMouseEnter($event, item.receiverId)"
                    @mouseleave="handleMouseLeave"
                  >{{ getReceiverName(item) }}</span>
                </template>
              </div>
              <span class="text-[10px] text-[var(--text-3)]">{{ formatTime(item.timestamp) }}</span>
            </div>
            <div 
              class="px-4 py-2.5 rounded-2xl text-sm shadow-sm relative group/msg overflow-hidden"
              :class="[
                item.senderType === 'user' 
                  ? 'bg-[var(--primary)] text-white rounded-tr-none' 
                  : 'bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] rounded-tl-none',
                item.status === 'sending' ? 'opacity-70' : ''
              ]"
            >
              <!-- 思考过程 (Reasoning) -->
              <div v-if="item.reasoning" class="mb-3">
                <div 
                  class="flex items-center space-x-2 py-1 px-2 rounded bg-[var(--surface-3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-4)] transition-colors opacity-80"
                  @click="toggleReasoning(item.id)"
                >
                  <Sparkles class="w-3 h-3 text-[var(--primary)]" />
                  <span class="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">思考过程</span>
                  <span class="flex-grow"></span>
                  <ChevronDown v-if="!expandedReasoning[item.id]" class="w-3 h-3" />
                  <ChevronUp v-else class="w-3 h-3" />
                </div>
                
                <div v-if="expandedReasoning[item.id]" class="mt-2 p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-xs italic text-[var(--text-2)] whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-200">
                  {{ item.reasoning }}
                </div>
              </div>

              <!-- 单个工具调用 (非组内) -->
              <div v-if="item.toolCall" class="mb-2">
                <div 
                  class="flex items-center space-x-2 py-1 px-2 rounded bg-[var(--surface-3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-4)] transition-colors"
                  @click="toggleToolCall(item.id)"
                >
                  <Wrench class="w-3 h-3 text-[var(--primary)]" />
                  <span class="text-xs font-mono font-bold text-[var(--text-1)]">{{ item.toolCall.name }}</span>
                  <span class="text-[10px] text-[var(--text-3)] flex-grow">工具调用</span>
                  <ChevronDown v-if="!expandedToolCalls[item.id]" class="w-3 h-3" />
                  <ChevronUp v-else class="w-3 h-3" />
                </div>
                
                <div v-if="expandedToolCalls[item.id]" class="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div class="p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg">
                    <div class="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">参数</div>
                    <pre class="text-xs font-mono text-[var(--text-2)] overflow-x-auto p-2 bg-[var(--surface-2)] rounded">{{ JSON.stringify(parseJson(item.toolCall.args), null, 2) }}</pre>
                  </div>
                  <div v-if="item.toolCall.result" class="p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg">
                    <div class="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">执行结果</div>
                    <pre class="text-xs font-mono text-[var(--text-2)] overflow-x-auto p-2 bg-[var(--surface-2)] rounded">{{ JSON.stringify(parseJson(item.toolCall.result), null, 2) }}</pre>
                  </div>
                </div>
              </div>

              <!-- 消息内容 -->
              <div v-if="item.content && !item.toolCall" class="whitespace-pre-wrap leading-relaxed break-words">{{ item.content }}</div>
              
              <!-- 如果是工具调用且有额外内容（非自动生成的提示）才显示 -->
              <div v-if="item.content && item.toolCall && !item.content.startsWith('调用工具:')" class="mt-2 whitespace-pre-wrap leading-relaxed break-words border-t border-[var(--border)] pt-2 opacity-80">{{ item.content }}</div>
              
              <!-- 负载 (Payload) -->
              <div v-if="item.payload && !item.content && !item.toolCall" class="mt-2">
                <pre class="text-xs font-mono text-[var(--text-3)] bg-[var(--surface-1)] p-2 rounded border border-[var(--border)] overflow-x-auto">{{ typeof item.payload === 'object' ? JSON.stringify(item.payload, null, 2) : item.payload }}</pre>
              </div>

              <!-- Token 使用量 - 只在连续消息的最后一条显示 -->
              <div v-if="item.usage && item.usage.totalTokens > 0 && item._isLastInGroup" class="mt-1">
                <span 
                  class="text-[10px] text-[var(--text-3)] cursor-help"
                  @mouseenter="showTokenTooltip($event, item.usage)"
                  @mouseleave="hideTokenTooltip"
                >
                  {{ item.usage.totalTokens }} tokens
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 连续工具调用组 -->
      <div 
        v-else
        :id="'msg-' + item.messages[0].id"
        class="flex justify-start group"
      >
        <div class="flex max-w-[90%] items-start space-x-3 flex-row">
          <!-- 头像 -->
          <div class="w-8 h-8 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <Bot class="w-4 h-4 text-[var(--primary)]" />
          </div>

          <!-- 组气泡 -->
          <div class="flex flex-col items-start w-full min-w-0">
            <div class="flex items-center space-x-2 mb-1 px-1">
              <div class="flex items-center space-x-1 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <span 
                  class="hover:text-[var(--primary)] cursor-pointer transition-colors"
                  @click="navigateToMessage(item.senderId, item.messages[0].id)"
                  @mouseenter="handleMouseEnter($event, item.senderId)"
                  @mouseleave="handleMouseLeave"
                >{{ getSenderName(item.messages[0]) }}</span>
                <template v-if="getReceiverName(item)">
                  <span class="opacity-50 mx-1">→</span>
                  <span 
                    class="hover:text-[var(--primary)] cursor-pointer transition-colors"
                    @click="navigateToMessage(item.receiverId, item.messages[0].id)"
                    @mouseenter="handleMouseEnter($event, item.receiverId)"
                    @mouseleave="handleMouseLeave"
                  >{{ getReceiverName(item) }}</span>
                </template>
              </div>
              <span class="text-[10px] text-[var(--text-3)]">{{ formatTime(item.timestamp) }}</span>
            </div>
            
            <div class="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl rounded-tl-none overflow-hidden shadow-sm">
              <!-- 组头：显示调用次数 -->
              <div 
                class="px-4 py-2 bg-[var(--surface-3)] border-b border-[var(--border)] flex items-center justify-between cursor-pointer hover:bg-[var(--surface-4)] transition-colors"
                @click="toggleGroup(item.id)"
              >
                <div class="flex items-center space-x-2">
                  <Wrench class="w-4 h-4 text-[var(--primary)]" />
                  <span class="text-xs font-bold text-[var(--text-2)]">连续执行了 {{ item.messages.length }} 个工具</span>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-[10px] text-[var(--text-3)] uppercase tracking-wider">{{ expandedGroups[item.id] ? '收起详情' : '展开详情' }}</span>
                  <ChevronDown v-if="!expandedGroups[item.id]" class="w-3 h-3" />
                  <ChevronUp v-else class="w-3 h-3" />
                </div>
              </div>

              <!-- 组内容：展开时显示所有调用 -->
              <div v-if="expandedGroups[item.id]" class="p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div v-for="msg in item.messages" :key="msg.id" class="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface-1)]">
                  <div 
                    class="px-3 py-1.5 bg-[var(--surface-2)] flex items-center justify-between cursor-pointer hover:bg-[var(--surface-3)]"
                    @click="toggleToolCall(msg.id)"
                  >
                    <div class="flex items-center space-x-2">
                      <Wrench class="w-3 h-3 text-[var(--primary)] opacity-70" />
                      <span class="text-xs font-mono font-medium text-[var(--text-1)]">{{ msg.toolCall.name }}</span>
                    </div>
                    <ChevronDown v-if="!expandedToolCalls[msg.id]" class="w-3 h-3 opacity-50" />
                    <ChevronUp v-else class="w-3 h-3 opacity-50" />
                  </div>
                  
                  <div v-if="expandedToolCalls[msg.id]" class="p-3 space-y-2 border-t border-[var(--border)]">
                    <!-- 组内消息的思考过程 -->
                    <div v-if="msg.reasoning" class="mb-2 p-2 bg-[var(--surface-3)] rounded text-[11px] italic text-[var(--text-3)] whitespace-pre-wrap border-l-2 border-[var(--primary)]">
                      {{ msg.reasoning }}
                    </div>
                    <div class="space-y-1">
                      <div class="text-[10px] font-bold text-[var(--text-3)] uppercase">参数</div>
                      <pre class="text-[11px] font-mono text-[var(--text-2)] overflow-x-auto p-2 bg-[var(--surface-2)] rounded">{{ JSON.stringify(parseJson(msg.toolCall.args), null, 2) }}</pre>
                    </div>
                    <div v-if="msg.toolCall.result" class="space-y-1">
                      <div class="text-[10px] font-bold text-[var(--text-3)] uppercase">结果</div>
                      <pre class="text-[11px] font-mono text-[var(--text-2)] overflow-x-auto p-2 bg-[var(--surface-2)] rounded">{{ JSON.stringify(parseJson(msg.toolCall.result), null, 2) }}</pre>
                    </div>
                    <!-- 单个工具调用的 Token 使用量 -->
                    <div v-if="msg.usage && msg.usage.totalTokens > 0" class="pt-1 border-t border-[var(--border)]">
                      <span 
                        class="text-[10px] text-[var(--text-3)] cursor-help"
                        @mouseenter="showTokenTooltip($event, msg.usage)"
                        @mouseleave="hideTokenTooltip"
                      >
                        {{ msg.usage.totalTokens }} tokens
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 工具调用组的总 Token 使用量 -->
              <div v-if="getGroupTotalTokens(item.messages) > 0" class="px-4 py-1.5 bg-[var(--surface-3)] border-t border-[var(--border)] flex justify-end">
                <span 
                  class="text-[10px] text-[var(--text-3)] cursor-help"
                  @mouseenter="showTokenTooltip($event, { 
                    promptTokens: getGroupPromptTokens(item.messages), 
                    completionTokens: getGroupCompletionTokens(item.messages), 
                    totalTokens: getGroupTotalTokens(item.messages) 
                  })"
                  @mouseleave="hideTokenTooltip"
                >
                  总计 {{ getGroupTotalTokens(item.messages) }} tokens
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <!-- 智能体详情 Tooltip -->
    <Teleport to="body">
      <div 
        v-if="hoveredAgent"
        class="fixed z-[9999] pointer-events-none transition-all duration-200"
        :style="{
          left: tooltipPosition.x + 'px',
          top: (tooltipPosition.y - 10) + 'px',
          transform: 'translate(-50%, -100%)'
        }"
      >
        <div class="bg-[var(--surface-4)] border border-[var(--border)] rounded-xl shadow-xl p-4 min-w-[240px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center shrink-0">
                <Bot class="w-6 h-6 text-[var(--primary)]" />
              </div>
              <div>
                <div class="text-sm font-bold text-[var(--text-1)]">{{ hoveredAgent.name }}</div>
                <div class="text-[10px] text-[var(--text-3)] font-mono opacity-70">{{ hoveredAgent.id }}</div>
              </div>
            </div>
            <div 
              class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              :class="{
                'bg-green-500/10 text-green-500': hoveredAgent.status === 'online',
                'bg-orange-500/10 text-orange-500': hoveredAgent.status === 'busy',
                'bg-gray-500/10 text-gray-300': hoveredAgent.status === 'offline'
              }"
            >
              {{ hoveredAgent.status === 'online' ? '在线' : (hoveredAgent.status === 'busy' ? '忙碌' : '离线') }}
            </div>
          </div>
          
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-[var(--text-3)]">岗位</span>
              <span class="text-[var(--text-2)] font-medium">{{ hoveredAgent.role }}</span>
            </div>
            <div v-if="hoveredAgent.lastSeen" class="flex items-center justify-between text-xs">
              <span class="text-[var(--text-3)]">最后活动</span>
              <span class="text-[var(--text-2)]">{{ formatTime(hoveredAgent.lastSeen) }}</span>
            </div>
          </div>
          
          <!-- 装饰三角形 -->
          <div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--border)]"></div>
        </div>
      </div>
    </Teleport>

    <!-- Token 使用量 Tooltip - 传送到 body 层级 -->
    <Teleport to="body">
      <div
        v-if="tokenTooltip.show && tokenTooltip.usage"
        class="fixed z-[9999] pointer-events-none"
        :style="{
          left: tokenTooltip.x + 'px',
          top: tokenTooltip.y + 'px',
          transform: 'translateX(-50%)'
        }"
      >
        <div class="bg-white border border-gray-200 rounded-lg shadow-lg p-2 whitespace-nowrap">
          <div class="text-[10px] text-gray-600 space-y-1">
            <div class="flex items-center space-x-2">
              <span class="text-gray-400">输入:</span>
              <span class="font-mono text-gray-700">{{ tokenTooltip.usage.promptTokens }}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="text-gray-400">输出:</span>
              <span class="font-mono text-gray-700">{{ tokenTooltip.usage.completionTokens }}</span>
            </div>
            <div class="border-t border-gray-200 pt-1 mt-1 flex items-center space-x-2">
              <span class="text-gray-400">总计:</span>
              <span class="font-mono font-medium text-gray-900">{{ tokenTooltip.usage.totalTokens }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
