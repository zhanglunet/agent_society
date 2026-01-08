/**
 * 图片查看器组件
 * 支持图片放大显示、多图导航
 */

const ImageViewer = {
  // 组件状态
  isOpen: false,
  images: [],
  currentIndex: 0,

  // DOM 元素引用
  modal: null,
  imageEl: null,
  prevBtn: null,
  nextBtn: null,
  closeBtn: null,
  counter: null,

  /**
   * 初始化组件
   */
  init() {
    this.createModal();
    this.bindEvents();
  },

  /**
   * 创建模态框 DOM
   */
  createModal() {
    // 检查是否已存在
    if (document.getElementById('image-viewer-modal')) {
      this.modal = document.getElementById('image-viewer-modal');
      this.imageEl = this.modal.querySelector('.image-viewer-image');
      this.prevBtn = this.modal.querySelector('.image-viewer-prev');
      this.nextBtn = this.modal.querySelector('.image-viewer-next');
      this.closeBtn = this.modal.querySelector('.image-viewer-close');
      this.counter = this.modal.querySelector('.image-viewer-counter');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'image-viewer-modal';
    modal.className = 'image-viewer-modal hidden';
    modal.innerHTML = `
      <div class="image-viewer-overlay"></div>
      <div class="image-viewer-container">
        <button class="image-viewer-close" title="关闭 (Esc)">×</button>
        <button class="image-viewer-prev" title="上一张 (←)">‹</button>
        <img class="image-viewer-image" src="" alt="图片预览">
        <button class="image-viewer-next" title="下一张 (→)">›</button>
        <div class="image-viewer-counter"></div>
      </div>
    `;

    document.body.appendChild(modal);

    this.modal = modal;
    this.imageEl = modal.querySelector('.image-viewer-image');
    this.prevBtn = modal.querySelector('.image-viewer-prev');
    this.nextBtn = modal.querySelector('.image-viewer-next');
    this.closeBtn = modal.querySelector('.image-viewer-close');
    this.counter = modal.querySelector('.image-viewer-counter');
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 关闭按钮
    this.closeBtn?.addEventListener('click', () => this.close());

    // 点击遮罩层关闭
    this.modal?.querySelector('.image-viewer-overlay')?.addEventListener('click', () => this.close());

    // 导航按钮
    this.prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prev();
    });
    this.nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.next();
    });

    // 键盘事件
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      switch (e.key) {
        case 'Escape':
          this.close();
          break;
        case 'ArrowLeft':
          this.prev();
          break;
        case 'ArrowRight':
          this.next();
          break;
      }
    });
  },

  /**
   * 显示图片查看器
   * @param {string[]} images - 图片路径数组
   * @param {number} startIndex - 起始索引
   */
  show(images, startIndex = 0) {
    if (!images || images.length === 0) return;

    this.images = images;
    this.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
    this.isOpen = true;

    this.render();
    this.modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /**
   * 关闭图片查看器
   */
  close() {
    this.isOpen = false;
    this.modal?.classList.add('hidden');
    document.body.style.overflow = '';
  },

  /**
   * 导航到上一张图片
   */
  prev() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
    this.render();
  },

  /**
   * 导航到下一张图片
   */
  next() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.render();
  },

  /**
   * 渲染当前图片
   */
  render() {
    if (!this.imageEl) return;

    const imagePath = this.images[this.currentIndex];
    // 构建完整的图片 URL
    this.imageEl.src = `/artifacts/${imagePath}`;
    this.imageEl.alt = `图片 ${this.currentIndex + 1}`;

    // 更新计数器
    if (this.counter) {
      if (this.images.length > 1) {
        this.counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        this.counter.style.display = 'block';
      } else {
        this.counter.style.display = 'none';
      }
    }

    // 更新导航按钮显示
    if (this.prevBtn) {
      this.prevBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
    }
    if (this.nextBtn) {
      this.nextBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
    }
  }
};

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ImageViewer.init());
} else {
  ImageViewer.init();
}

// 导出供其他模块使用
window.ImageViewer = ImageViewer;
