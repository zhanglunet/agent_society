<template>
    <div class="flex flex-col h-[70vh] bg-transparent overflow-hidden rounded-b-xl relative text-[var(--text-1)]">
        <!-- 统计栏 -->
        <div class="grid grid-cols-3 gap-4 p-4 border-b border-[var(--border)] bg-[var(--surface-1)] z-20">
            <div class="flex flex-col items-center p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <Network class="w-5 h-5 text-[var(--primary)] mb-1" />
                <span class="text-xs text-[var(--text-3)]">总岗位数</span>
                <span class="text-xl font-bold text-[var(--text-1)]">{{ totalRoles }}</span>
            </div>
            <div class="flex flex-col items-center p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <Users class="w-5 h-5 text-blue-500 mb-1" />
                <span class="text-xs text-[var(--text-3)]">总智能体</span>
                <span class="text-xl font-bold text-[var(--text-1)]">{{ totalAgents }}</span>
            </div>
            <div class="flex flex-col items-center p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <Activity class="w-5 h-5 text-green-500 mb-1" />
                <span class="text-xs text-[var(--text-3)]">存活智能体</span>
                <span class="text-xl font-bold text-[var(--text-1)]">{{ totalActiveAgents }}</span>
            </div>
        </div>

        <!-- 缩放和平移容器 -->
        <div 
            ref="containerRef"
            :class="['flex-grow overflow-hidden relative cursor-grab active:cursor-grabbing bg-[var(--bg)] select-none', { 'fixed inset-0 z-[9999]': isFullscreen }]"
            @wheel="onWheel"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseUp"
        >
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-[var(--bg)] bg-opacity-50 z-30">
                <Loader2 class="w-10 h-10 animate-spin text-[var(--primary)]" />
            </div>

            <div v-else-if="!roleTree || (Array.isArray(roleTree) && roleTree.length === 0)" class="flex flex-col items-center justify-center h-full text-[var(--text-3)] opacity-50">
                <Network class="w-12 h-12 mb-4" />
                <p>暂无组织架构数据</p>
                <Button variant="text" size="small" class="mt-4" @click="fetchData">
                    <RefreshCw class="w-4 h-4 mr-2" />
                    重新加载
                </Button>
            </div>

            <!-- 图形化画布 -->
            <div 
                v-if="roleTree"
                class="absolute origin-[0_0]"
                :style="{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                }"
            >
                <div class="p-20">
                    <OrganizationChart :value="roleTree">
                        <template #default="slotProps">
                            <div class="role-node-card" :class="{ 'virtual-root': slotProps.node.data?.isVirtual }">
                                <div class="role-node-header">
                                    <Network class="w-4 h-4 text-[var(--primary)]" />
                                    <span class="role-name">{{ slotProps.node.label }}</span>
                                    <div v-if="!slotProps.node.data?.isVirtual" class="flex-grow flex justify-end gap-1">
                                        <button
                                            class="edit-btn"
                                            @click.stop="handleEditRole(slotProps.node, slotProps.node.label)"
                                            title="查看/编辑岗位详情"
                                        >
                                            <Edit class="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            class="delete-btn"
                                            @click.stop="handleDeleteRole(slotProps.node.key, slotProps.node.label)"
                                            title="删除岗位及所有子分支"
                                        >
                                            <Trash2 class="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div class="role-node-body">
                                    <div v-if="!slotProps.node.data?.isVirtual" class="role-id">{{ slotProps.node.key?.toString().split('-')[0] }}</div>
                                    <div class="role-stats">
                                        <div class="stat-item" title="总智能体">
                                            <Users class="w-3 h-3 text-blue-500" />
                                            <span>{{ slotProps.node.data?.agentCount || 0 }}</span>
                                        </div>
                                        <div class="stat-item" :class="{ 'active': (slotProps.node.data?.activeAgentCount || 0) > 0 }" title="活跃智能体">
                                            <Activity class="w-3 h-3" :class="(slotProps.node.data?.activeAgentCount || 0) > 0 ? 'text-green-500' : 'text-[var(--text-3)]'" />
                                            <span>{{ slotProps.node.data?.activeAgentCount || 0 }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </OrganizationChart>
                </div>
            </div>

            <!-- 操作提示和重置按钮 -->
            <div class="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
                <div class="px-3 py-1.5 rounded-full bg-[var(--surface-1)] border border-[var(--border)] text-[10px] text-[var(--text-3)] shadow-lg">
                    滚轮缩放 | 按住拖动
                </div>
                <div class="flex gap-2 justify-end">
                    <Button @click="zoomAtCenter(-0.1)" variant="text" size="small" class="!bg-[var(--surface-1)] shadow-md !w-8 !h-8 !p-0 flex items-center justify-center">
                        <ZoomOut class="w-4 h-4 text-[var(--text-1)]" />
                    </Button>
                    <Button @click="resetView" variant="text" size="small" class="!bg-[var(--surface-1)] shadow-md !w-8 !h-8 !p-0 flex items-center justify-center">
                        <RefreshCw class="w-4 h-4 text-[var(--text-1)]" />
                    </Button>
                    <Button @click="zoomAtCenter(0.1)" variant="text" size="small" class="!bg-[var(--surface-1)] shadow-md !w-8 !h-8 !p-0 flex items-center justify-center">
                        <ZoomIn class="w-4 h-4 text-[var(--text-1)]" />
                    </Button>
                    <Button @click="toggleFullscreen" variant="text" size="small" v-tooltip.top="isFullscreen ? '退出全屏' : '全屏查看'" class="!bg-[var(--surface-1)] shadow-md !w-8 !h-8 !p-0 flex items-center justify-center">
                        <Maximize2 v-if="!isFullscreen" class="w-4 h-4 text-[var(--text-1)]" />
                        <Minimize2 v-else class="w-4 h-4 text-[var(--text-1)]" />
                    </Button>
                </div>
            </div>
        </div>
        
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, nextTick, onUnmounted } from 'vue';
import { Network, Users, Activity, ZoomIn, ZoomOut, RefreshCw, Loader2, Trash2, Maximize2, Minimize2, Edit } from 'lucide-vue-next';
import Button from 'primevue/button';
import OrganizationChart from 'primevue/organizationchart';
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useDialog } from 'primevue/usedialog';
import { apiService } from "../../services/api";
import RoleDetailDialog from './RoleDetailDialog.vue';

const confirm = useConfirm();
const toast = useToast();
const dialog = useDialog();
const loading = ref(true);
const containerRef = ref<HTMLElement | null>(null);
const roleTree = ref<any>(null);
const totalRoles = ref(0);
const totalAgents = ref(0);
const totalActiveAgents = ref(0);

// 缩放和平移状态
const scale = ref(1);
const offset = reactive({ x: 0, y: 0 });
const isDragging = ref(false);
const dragStart = reactive({ x: 0, y: 0 });

// 全屏状态
const isFullscreen = ref(false);

// 切换全屏模式
const toggleFullscreen = async () => {
    try {
        if (!document.fullscreenElement) {
            await containerRef.value?.requestFullscreen();
            isFullscreen.value = true;
        } else {
            await document.exitFullscreen();
            isFullscreen.value = false;
        }
        // 全屏切换后重新居中
        setTimeout(() => {
            centerChart();
        }, 100);
    } catch (err) {
        console.error('全屏切换失败:', err);
    }
};

// 监听全屏变化事件
const handleFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement;
    setTimeout(() => {
        centerChart();
    }, 100);
};

const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 计算当前鼠标位置在内容坐标系中的位置 (相对于内容左上角)
    const contentX = (mouseX - offset.x) / scale.value;
    const contentY = (mouseY - offset.y) / scale.value;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(0.2, scale.value + delta), 2);
    
    // 更新偏移量，使缩放后鼠标指向的内容坐标保持在鼠标当前位置
    offset.x = mouseX - contentX * newScale;
    offset.y = mouseY - contentY * newScale;
    scale.value = newScale;
};

const onMouseDown = (e: MouseEvent) => {
    isDragging.value = true;
    dragStart.x = e.clientX - offset.x;
    dragStart.y = e.clientY - offset.y;
};

const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return;
    offset.x = e.clientX - dragStart.x;
    offset.y = e.clientY - dragStart.y;
};

const onMouseUp = () => {
    isDragging.value = false;
};

const zoomAtCenter = (delta: number) => {
    if (!containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const contentX = (centerX - offset.x) / scale.value;
    const contentY = (centerY - offset.y) / scale.value;
    
    const newScale = Math.min(Math.max(0.2, scale.value + delta), 2);
    offset.x = centerX - contentX * newScale;
    offset.y = centerY - contentY * newScale;
    scale.value = newScale;
};

const resetView = () => {
    scale.value = 1;
    centerChart();
};

const centerChart = async () => {
    await nextTick();
    // 等待一点时间确保 PrimeVue 组件完全渲染并应用了样式
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!containerRef.value) return;
    
    const container = containerRef.value;
    const chartContent = container.querySelector('.p-organizationchart');
    
    if (chartContent) {
         const containerWidth = container.clientWidth;
         const chartWidth = (chartContent as HTMLElement).offsetWidth;
         
         // 考虑外层 p-20 (80px) 的影响
         offset.x = (containerWidth - chartWidth) / 2 - 80;
         offset.y = 20;
     } else {
        // 如果找不到图表内容，则默认重置
        offset.x = 0;
        offset.y = 0;
    }
};

// 构建岗位树
const buildTree = (roles: any[], agents: any[]) => {
    const roleMap = new Map<string, any>();
    
    // 过滤掉名为 root 或 user 的特殊智能体
    const filteredAgents = agents.filter(a => a.id !== 'root' && a.id !== 'user');
    // 过滤掉名为 root 或 user 的岗位 (如果有的话)
    const filteredRoles = roles.filter(r => r.name !== 'root' && r.name !== 'user' && r.id !== 'root' && r.id !== 'user');

    // 统计每个岗位的智能体数量
    const agentStats = new Map<string, { total: number, active: number }>();
    filteredAgents.forEach(agent => {
        const stats = agentStats.get(agent.roleId) || { total: 0, active: 0 };
        stats.total++;
        if (agent.status === 'active' || agent.computeStatus !== 'stopped') {
            stats.active++;
        }
        agentStats.set(agent.roleId, stats);
    });

    // 创建所有节点
    filteredRoles.forEach(role => {
        const stats = agentStats.get(role.id) || { total: 0, active: 0 };
        roleMap.set(role.id, {
            key: role.id,
            label: role.name,
            data: {
                createdBy: role.createdBy,
                agentCount: stats.total,
                activeAgentCount: stats.active
            },
            children: [],
            expanded: true
        });
    });

    const rootNodes: any[] = [];
    
    roleMap.forEach(node => {
        const createdBy = node.data.createdBy;
        // 如果创建者是 root，则将其视为顶级节点
        if (createdBy === 'root' || !createdBy) {
            rootNodes.push(node);
        } else {
            // 否则尝试找到创建该岗位的智能体所属的岗位
            const creatorAgent = agents.find(a => a.id === createdBy);
            if (creatorAgent && roleMap.has(creatorAgent.roleId)) {
                const parentRole = roleMap.get(creatorAgent.roleId);
                parentRole.children.push(node);
            } else {
                // 如果找不到父级，也作为顶级节点展示
                rootNodes.push(node);
            }
        }
    });

    // 如果有多个根节点，创建一个虚拟根节点来统一展示
    if (rootNodes.length > 1) {
        return {
            key: 'society-root',
            label: '智能体社会',
            data: {
                agentCount: totalAgents.value,
                activeAgentCount: totalActiveAgents.value,
                isVirtual: true
            },
            children: rootNodes,
            expanded: true
        };
    }

    return rootNodes[0] || null;
};

const fetchData = async () => {
    loading.value = true;
    try {
        const [roles, agents] = await Promise.all([
            apiService.getRoles(),
            apiService.getAllAgentsRaw()
        ]);

        // 过滤掉名为 root 或 user 的特殊智能体和岗位，与 buildTree 保持一致
        const filteredAgents = agents.filter((a: any) => a.id !== 'root' && a.id !== 'user');
        const filteredRoles = roles.filter((r: any) => r.name !== 'root' && r.name !== 'user' && r.id !== 'root' && r.id !== 'user');

        totalRoles.value = filteredRoles.length;
        totalAgents.value = filteredAgents.length;
        totalActiveAgents.value = filteredAgents.filter((a: any) => a.status === 'active' || a.computeStatus !== 'stopped').length;
        roleTree.value = buildTree(roles, agents);
        centerChart();
    } catch (error) {
        console.error('获取岗位树数据失败:', error);
    } finally {
        loading.value = false;
    }
};

const handleDeleteRole = (roleId: string, roleName: string) => {
    confirm.require({
        message: `确定要删除岗位 "${roleName}" 吗？\n注意：这将递归删除该岗位及其所有子分支（包括所有关联的智能体）。此操作不可撤销！`,
        header: '确认删除',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: '取消',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: '确定删除',
            severity: 'danger'
        },
        accept: async () => {
            try {
                await apiService.deleteRole(roleId, {
                    reason: '用户从总览视图删除',
                    deletedBy: 'user'
                });

                toast.add({ 
                    severity: 'success', 
                    summary: '删除成功', 
                    detail: `岗位 "${roleName}" 及其分支已删除`, 
                    life: 3000 
                });
                // 刷新数据
                await fetchData();
            } catch (error: any) {
                console.error('删除岗位失败:', error);
                toast.add({ 
                    severity: 'error', 
                    summary: '删除失败', 
                    detail: error.message || '删除岗位失败，请检查网络连接。', 
                    life: 5000 
                });
            }
        }
    });
};

const handleEditRole = (node: any, roleName: string) => {
    // 从节点对象中获取ID
    const roleId = node?.key || node?.data?.id;

    // 验证岗位ID
    if (!roleId || roleId === 'society-root') {
        console.warn('无效的岗位ID:', roleId, '节点:', node);
        toast.add({
            severity: 'warn',
            summary: '无法编辑',
            detail: '该岗位不支持编辑',
            life: 3000
        });
        return;
    }

    console.log('编辑岗位:', { roleId, roleName, node });

    dialog.open(RoleDetailDialog, {
        props: {
            header: `岗位详情: ${roleName}`,
            style: { width: '600px' },
            modal: true,
            closable: true,
            dismissableMask: true,
        },
        data: {
            roleId,
            roleName
        },
        emits: {
            onUpdate: async () => {
                await fetchData();
            }
        }
    });
};

onMounted(() => {
    fetchData();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onUnmounted(() => {
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
});
</script>

<style scoped>
/* 节点卡片样式 */
.role-node-card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0;
    min-width: 160px;
    overflow: hidden;
    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
}

.role-node-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15);
}

.role-node-card.virtual-root {
    border-color: var(--primary);
    background: linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%);
}

.role-node-card.virtual-root .role-node-header {
    background: rgba(var(--primary-rgb), 0.1);
}

.role-node-card.virtual-root .role-name {
    color: var(--primary);
    font-size: 14px;
}

.role-node-header {
    background: var(--surface-2);
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
}

.role-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--text-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
}

.edit-btn {
    padding: 4px;
    border-radius: 4px;
    color: var(--text-3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
}

.edit-btn:hover {
    color: var(--primary);
    background: var(--primary-weak);
}

.delete-btn {
    padding: 4px;
    border-radius: 4px;
    color: var(--text-3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
}

.delete-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
}

.role-node-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.role-id {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-3);
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: 4px;
    align-self: flex-start;
}

.role-stats {
    display: flex;
    gap: 8px;
}

.stat-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
}

.stat-item.active {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.05);
}

/* 覆盖 PrimeVue OrganizationChart 默认样式 */
:deep(.p-organizationchart-connector-down) {
    background: var(--primary);
    width: 2px;
    margin: 0 auto;
}

:deep(.p-organizationchart-connector-left) {
    border-right: 1px solid var(--primary);
}

:deep(.p-organizationchart-connector-right) {
    border-left: 1px solid var(--primary);
}

:deep(.p-organizationchart-connector-top) {
    border-top: 2px solid var(--primary);
}

:deep(.p-organizationchart-table) {
    border-spacing: 0;
    border-collapse: separate;
    margin: 0 auto;
}

:deep(.p-organizationchart-node-content) {
    border: none;
    background: transparent !important;
    padding: 10px 20px;
}

:deep(.p-organizationchart-node) {
    background: transparent !important;
    border: none !important;
}

/* 兼容旧版本或其他主题可能的类名 */
:deep(.p-organizationchart-line-down) {
    background: var(--primary);
    width: 2px;
}

:deep(.p-organizationchart-line-left),
:deep(.p-organizationchart-line-right),
:deep(.p-organizationchart-line-top) {
    border-color: var(--primary);
    border-width: 2px;
}
</style>
