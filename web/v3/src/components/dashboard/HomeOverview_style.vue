<style scoped>
:deep(.p-card) {
  border-radius: 1.25rem;
}

:deep(.p-card-body) {
  padding: 1.5rem;
}

.chat-expand-animation {
  animation: expandDown 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top;
}

@keyframes expandDown {
  from {
    opacity: 0;
    transform: scaleY(0);
    max-height: 0;
  }
  to {
    opacity: 1;
    transform: scaleY(1);
    max-height: 50vh;
  }
}

/* ============================================
   Non-Blocking Design
   非阻塞设计：确保输入框和按钮始终可交互
   ============================================ */

/* 输入区域容器 */
.input-area-container {
  position: relative;
  z-index: 101;  /* 高于气泡（z-index: 100），确保可点击 */
  pointer-events: auto;  /* 始终可交互 */
}

.input-area-container :deep(.p-textarea),
.input-area-container button {
  position: relative;
  z-index: 101;  /* 高于气泡 */
  pointer-events: auto;  /* 始终可交互 */
}

/* 气泡容器 */
.guide-bubble-container {
  position: absolute;
  bottom: 100%;  /* 输入框上方 */
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;  /* 容器不拦截事件 */
  z-index: 100;  /* 低于输入区域 */
  margin-bottom: 24px;  /* 确保不遮挡输入框 */
}

.guide-bubble-container--send {
  /* 指向发送按钮的引导 */
}

/* 确保气泡不遮挡输入框 */
.guide-bubble-container :deep(.guide-bubble) {
  position: absolute;
  bottom: 24px;  /* 输入框上方24px */
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: auto;  /* 气泡自身可交互 */
}

/* ============================================
   Responsive Design
   响应式适配
   ============================================ */

/* 移动端 */
@media (max-width: 768px) {
  .guide-bubble-container {
    margin-bottom: 12px;  /* 紧凑但仍不遮挡 */
  }
  
  .guide-bubble-container :deep(.guide-bubble) {
    bottom: 12px;
  }
}

/* 小屏手机 */
@media (max-width: 480px) {
  .guide-bubble-container {
    margin-bottom: 8px;
  }
  
  .guide-bubble-container :deep(.guide-bubble) {
    bottom: 8px;
  }
}
</style>
