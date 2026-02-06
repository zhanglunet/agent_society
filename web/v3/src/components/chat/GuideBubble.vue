<template>
  <Teleport to="body">
    <div
      v-show="visible"
      ref="bubbleRef"
      class="guide-bubble"
      :class="[
        `guide-bubble--${position}`,
        { 'guide-bubble--no-arrow': !showArrow }
      ]"
      :style="bubbleStyle"
      role="dialog"
      aria-label="新手引导（可随时关闭）"
      tabindex="-1"
      @keydown.esc="handleEsc"
    >
      <div class="guide-bubble__content">
        <div class="guide-bubble__header"> <svg v-if="showArrow" class="guide-bubble__arrow-svg" :style="arrowStyle" viewBox="-10 0 30 40" preserveAspectRatio="none">
        <polygon points="-100,0 -10,80 20,-50" fill="var(--surface-1)" stroke="var(--border)" stroke-width="1"/>
      </svg>
          <div class="guide-bubble__icon guide-bubble__icon--animated">
            <Rocket class="w-6 h-6" />
          </div>
          <h3 class="guide-bubble__title">{{ title || '开始使用' }}</h3>
        </div>

        <div v-if="text" class="guide-bubble__text">
          <p>{{ text }}</p>
        </div>

        <div v-if="hintText" class="guide-bubble__hint">
          <small>{{ hintText }}</small>
        </div>

        <Button
          v-if="showCloseButton"
          class="guide-bubble__close"
          severity="secondary"
          text
          :aria-label="'关闭提示'"
          @click="handleClose"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>

     
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Rocket, X } from 'lucide-vue-next';
import Button from 'primevue/button';

interface GuideBubbleProps {
  visible: boolean;
  position: 'top' | 'right' | 'left' | 'bottom';
  title?: string;
  text?: string;
  hintText?: string;
  icon?: string;
  showCloseButton?: boolean;
  showArrow?: boolean;
  offset?: {
    x?: number;
    y?: number;
  };
  targetSelector?: string;
}

interface GuideBubbleEmits {
  (e: 'close'): void;
}

const props = withDefaults(defineProps<GuideBubbleProps>(), {
  showCloseButton: true,
  showArrow: true,
  offset: () => ({ x: 0, y: 0 }),
  targetSelector: '.p-button-icon-only',
});

const emit = defineEmits<GuideBubbleEmits>();

const bubbleRef = ref<HTMLElement | null>(null);
const bubblePosition = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const arrowTopPosition = ref<string>('50%');

const updateBubblePosition = () => {
  if (!props.targetSelector || !bubbleRef.value) return;

  const targetElement = document.querySelector(props.targetSelector) as HTMLElement;
  if (!targetElement) return;

  const targetRect = targetElement.getBoundingClientRect();
  const bubbleRect = bubbleRef.value.getBoundingClientRect();
  
  // 气泡在目标左下方24px（保持原有逻辑不变）
  const bubbleX = targetRect.left - bubbleRect.width - 24;
  const bubbleY = targetRect.bottom + 24;
  
  bubblePosition.value = {
    x: bubbleX,
    y: bubbleY
  };
  
  // 箭头垂直对齐目标中心
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const relativeY = targetCenterY - bubbleY;
  // 限制箭头在气泡范围内（留出边距）
  const clampedY = Math.max(20, Math.min(bubbleRect.height - 20, relativeY));
  arrowTopPosition.value = `${clampedY}px`;
};

const bubbleStyle = computed(() => {
  const style: Record<string, string> = {
    transform: `translate(${bubblePosition.value.x}px, ${bubblePosition.value.y}px)`,
    width: '320px'
  };

  return style;
});

const arrowStyle = computed(() => {
  return {
    top: arrowTopPosition.value,
    transform: 'translateY(-50%)'
  };
});

let updateTimer: number | null = null;
const handleUpdate = () => {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = window.setTimeout(() => {
    updateBubblePosition();
  }, 100);
};

onMounted(() => {
  if (props.visible) {
    nextTick(() => {
      updateBubblePosition();
    });
  }

  window.addEventListener('resize', handleUpdate);
  window.addEventListener('scroll', handleUpdate);
});

onUnmounted(() => {
  if (updateTimer) clearTimeout(updateTimer);
  window.removeEventListener('resize', handleUpdate);
  window.removeEventListener('scroll', handleUpdate);
});

watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      updateBubblePosition();
    });
  }
});

const handleClose = () => {
  emit('close');
};

const handleEsc = () => {
  emit('close');
};
</script>

<style scoped>
.guide-bubble {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  bottom: auto !important;
  right: auto !important;
  z-index: 300 !important;
  width: 320px;
  max-width: 320px;
  min-width: 280px;
  padding: 20px;
  margin: 0;
  background-color: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 
    0 12px 32px rgba(0, 0, 0, 0.12),
    0 4px 8px rgba(0, 0, 0, 0.08),
    0 0 1px rgba(0, 0, 0, 0.04);
  animation: bubble-float-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.my-app-dark .guide-bubble {
  background-color: var(--surface-1);
  border-color: var(--border);
  box-shadow: 
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 4px 8px rgba(0, 0, 0, 0.24),
    0 0 1px rgba(0, 0, 0, 0.12);
}

.guide-bubble__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.guide-bubble__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.guide-bubble__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: 0 16px;
  font-size: 32px;
  line-height: 1;
  color: var(--primary);
}

.guide-bubble__icon--animated {
  animation: icon-float 3s ease-in-out infinite;
}

@keyframes icon-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.guide-bubble__title {
  margin: 0 0 12px;
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  word-wrap: break-word;
}

.guide-bubble__text {
  margin: 0 0 16px;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  text-align: center;
  word-wrap: break-word;
}

.guide-bubble__text p {
  margin: 0;
}

.guide-bubble__hint {
  margin-bottom: 12px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  font-style: italic;
  text-align: center;
  word-wrap: break-word;
}

.guide-bubble__hint small {
  font-size: inherit;
}

.guide-bubble__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 101 !important;
  width: 32px;
  height: 32px;
  padding: 0;
  background-color: transparent;
  border: none;
  border-radius: 12px;
  color: var(--text-3);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guide-bubble__close:hover {
  background-color: var(--surface-3);
  color: var(--text-1);
}

.guide-bubble__close:active {
  transform: scale(0.95);
}

.guide-bubble__close:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* SVG 箭头样式 */
.guide-bubble__arrow-svg {
  position: absolute;
  width: 16px;
  height: 40px;
  z-index: 101 !important;
  overflow: visible;
}

.guide-bubble__arrow-svg polygon {
  stroke: var(--border);
  stroke-width: 1;
}

/* position="bottom" - 气泡在目标左侧，箭头在右侧指向右 */
.guide-bubble--bottom .guide-bubble__arrow-svg {
  right: -16px;
}

/* position="top" - 气泡在目标左侧偏上，箭头在右侧指向右 */
.guide-bubble--top .guide-bubble__arrow-svg {
  right: -16px;
}

/* position="left" - 气泡在目标右侧，箭头在左侧指向左 */
.guide-bubble--left .guide-bubble__arrow-svg {
  left: -16px;
  transform: translateY(-50%) scaleX(-1);
}

/* position="right" - 气泡在目标左侧，箭头在右侧指向右 */
.guide-bubble--right .guide-bubble__arrow-svg {
  right: -16px;
}

/* 深色模式适配 */
.my-app-dark .guide-bubble__arrow-svg polygon {
  fill: var(--surface-1);
  stroke: var(--border);
}

@keyframes bubble-float-in {
  0% {
    opacity: 0;
    transform: translateY(-16px) scale(0.9);
  }
  50% {
    opacity: 0.5;
    transform: translateY(-4px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes bubble-float-out {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  50% {
    opacity: 0.5;
    transform: translateY(-4px) scale(0.95);
  }
  100% {
    opacity: 0;
    transform: translateY(-16px) scale(0.9);
  }
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.9);
}

@media (max-width: 1024px) {
  .guide-bubble {
    width: auto;
    max-width: calc(100vw - 48px);
    min-width: 260px;
  }
}

@media (max-width: 768px) {
  .guide-bubble {
    padding: 16px;
    max-width: calc(100vw - 48px);
  }
  
  .guide-bubble__title {
    font-size: 16px;
  }
  
  .guide-bubble__text {
    font-size: 13px;
  }
  
  .guide-bubble__hint {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .guide-bubble {
    padding: 12px;
    max-width: calc(100vw - 24px);
  }
  
  .guide-bubble__icon {
    width: 40px;
    height: 40px;
    font-size: 28px;
    margin: 0 12px;
  }
  
  .guide-bubble__title {
    font-size: 15px;
  }
  
  .guide-bubble__text {
    font-size: 12px;
  }
  
  .guide-bubble__hint {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide-bubble {
    animation: none;
  }
  
  .guide-bubble__icon--animated {
    animation: none;
  }
  
  .bubble-fade-enter-active,
  .bubble-fade-leave-active {
    transition: none;
  }
  
  .bubble-fade-enter-from,
  .bubble-fade-leave-to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-contrast: high) {
  .guide-bubble {
    border-width: 2px;
    border-color: var(--text-1);
  }
  
  .guide-bubble__close {
    background-color: var(--surface-3);
    border: 1px solid var(--text-1);
  }
}

.guide-bubble--no-arrow .guide-bubble__arrow {
  display: none;
}

@media print {
  .guide-bubble {
    display: none;
  }
}
</style>
