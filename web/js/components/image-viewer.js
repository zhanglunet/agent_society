/**
 * 图片查看器组件
 * 显示图片缩略图和灯箱预览，支持缩放和导航
 */
class ImageViewer {
  constructor(options = {}) {
    this.container = options.container;
    this.imagePath = null;
    this.imageData = null;
    this.currentZoom = 1;
  }

  /**
   * 渲染图片
   */
  render(imageData) {
    this.imageData = imageData;
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "image-viewer";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.height = "100%";
    wrapper.style.overflow = "auto";
    wrapper.style.padding = "20px";
    wrapper.style.backgroundColor = "#1e1e1e";

    // 图片信息
    const infoDiv = document.createElement("div");
    infoDiv.className = "image-info";
    infoDiv.style.marginBottom = "20px";
    infoDiv.style.color = "#d4d4d4";
    infoDiv.style.fontSize = "13px";

    // 尝试从imageData中提取信息
    let width = "未知";
    let height = "未知";
    let size = "未知";

    if (typeof imageData === "string" && imageData.startsWith("data:")) {
      // Base64编码的图片
      infoDiv.innerHTML = `
        <div>格式: Base64编码图片</div>
        <div>大小: ${this._formatSize(imageData.length)}</div>
      `;
    } else if (typeof imageData === "object" && imageData.width && imageData.height) {
      width = imageData.width;
      height = imageData.height;
      size = imageData.size ? this._formatSize(imageData.size) : "未知";
      infoDiv.innerHTML = `
        <div>尺寸: ${width} × ${height} px</div>
        <div>大小: ${size}</div>
      `;
    }

    wrapper.appendChild(infoDiv);

    // 缩略图容器
    const thumbnailDiv = document.createElement("div");
    thumbnailDiv.className = "image-thumbnail";
    thumbnailDiv.style.textAlign = "center";
    thumbnailDiv.style.marginBottom = "20px";

    const img = document.createElement("img");
    img.style.maxWidth = "100%";
    img.style.maxHeight = "300px";
    img.style.cursor = "pointer";
    img.style.border = "1px solid #3e3e42";
    img.style.borderRadius = "4px";

    // 设置图片源
    const imgSrc = this._getImageSrc(imageData);
    img.src = imgSrc;

    // 点击打开灯箱
    img.addEventListener("click", () => {
      this._openLightbox(img.src);
    });

    img.addEventListener("error", () => {
      thumbnailDiv.innerHTML = '<div style="color: #d4d4d4;">图片加载失败</div>';
    });

    thumbnailDiv.appendChild(img);
    wrapper.appendChild(thumbnailDiv);

    // 提示文本
    const hintDiv = document.createElement("div");
    hintDiv.style.color = "#858585";
    hintDiv.style.fontSize = "12px";
    hintDiv.textContent = "点击图片查看全尺寸";
    wrapper.appendChild(hintDiv);

    this.container.appendChild(wrapper);
  }

  /**
   * 获取图片源 URL
   */
  _getImageSrc(imageData) {
    if (!imageData) return "";
    
    // Base64 编码的图片
    if (typeof imageData === "string" && imageData.startsWith("data:")) {
      return imageData;
    }
    
    // 对象形式，包含 data 字段
    if (typeof imageData === "object" && imageData.data) {
      return imageData.data;
    }
    
    // 完整 URL
    if (typeof imageData === "string" && (imageData.startsWith("http://") || imageData.startsWith("https://"))) {
      return imageData;
    }
    
    // 文件名，构建 artifacts 路径
    if (typeof imageData === "string") {
      return `/artifacts/${imageData}`;
    }
    
    return "";
  }

  /**
   * 打开灯箱
   */
  _openLightbox(imageSrc) {
    const lightbox = document.createElement("div");
    lightbox.className = "image-lightbox";
    lightbox.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      overflow: hidden;
      cursor: grab;
    `;

    const img = document.createElement("img");
    img.src = imageSrc;
    img.style.cssText = `
      position: absolute;
      transform-origin: center center;
      cursor: grab;
      user-select: none;
      -webkit-user-drag: none;
    `;

    // 缩放和拖拽状态
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastTranslateX = 0;
    let lastTranslateY = 0;

    const updateTransform = () => {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    // 图片加载后居中
    img.onload = () => {
      updateTransform();
    };

    // 鼠标滚轮缩放
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(scale * delta, 20));
      
      // 以鼠标位置为中心缩放
      const rect = img.getBoundingClientRect();
      const imgCenterX = rect.left + rect.width / 2;
      const imgCenterY = rect.top + rect.height / 2;
      const mouseOffsetX = e.clientX - imgCenterX;
      const mouseOffsetY = e.clientY - imgCenterY;
      
      const scaleRatio = newScale / scale;
      translateX -= mouseOffsetX * (scaleRatio - 1);
      translateY -= mouseOffsetY * (scaleRatio - 1);
      
      scale = newScale;
      updateTransform();
    };

    // 拖拽开始
    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
      lightbox.style.cursor = "grabbing";
      img.style.cursor = "grabbing";
    };

    // 拖拽移动
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      translateX = lastTranslateX + (e.clientX - startX);
      translateY = lastTranslateY + (e.clientY - startY);
      updateTransform();
    };

    // 拖拽结束
    const handleMouseUp = () => {
      isDragging = false;
      lightbox.style.cursor = "grab";
      img.style.cursor = "grab";
    };

    // 双击重置
    const handleDblClick = (e) => {
      if (e.target === img) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
      }
    };

    // 关闭按钮
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 20px;
      z-index: 10001;
    `;

    // 提示信息
    const hint = document.createElement("div");
    hint.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.7);
      color: #999;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10001;
    `;
    hint.textContent = "滚轮缩放 · 拖拽移动 · 双击重置 · ESC关闭";

    const closeLightbox = () => {
      lightbox.removeEventListener("wheel", handleWheel);
      lightbox.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
      if (document.body.contains(lightbox)) {
        document.body.removeChild(lightbox);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeLightbox();
      }
    };

    closeBtn.addEventListener("click", closeLightbox);
    
    // 点击背景关闭（但不是点击图片）
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });

    lightbox.addEventListener("wheel", handleWheel, { passive: false });
    lightbox.addEventListener("mousedown", handleMouseDown);
    lightbox.addEventListener("dblclick", handleDblClick);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);

    lightbox.appendChild(img);
    lightbox.appendChild(closeBtn);
    lightbox.appendChild(hint);
    document.body.appendChild(lightbox);
  }

  /**
   * 格式化文件大小
   */
  _formatSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  }
}

/**
 * 静态方法：显示图片灯箱（供聊天面板等外部调用）
 * @param {string[]} images - 图片路径数组
 * @param {number} startIndex - 起始索引
 */
ImageViewer.show = function(images, startIndex = 0) {
  if (!images || images.length === 0) return;
  
  const currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  
  // 获取图片 URL
  const getImageUrl = (img) => {
    if (!img) return "";
    if (img.startsWith("data:") || img.startsWith("http://") || img.startsWith("https://")) {
      return img;
    }
    return `/artifacts/${img}`;
  };

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    overflow: hidden;
    cursor: grab;
  `;

  const img = document.createElement("img");
  img.src = getImageUrl(images[currentIndex]);
  img.style.cssText = `
    position: absolute;
    transform-origin: center center;
    cursor: grab;
    user-select: none;
    -webkit-user-drag: none;
    max-width: 90vw;
    max-height: 90vh;
  `;

  // 缩放和拖拽状态
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let lastTranslateX = 0;
  let lastTranslateY = 0;
  let index = currentIndex;

  const updateTransform = () => {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  const resetView = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
  };

  const showImage = (newIndex) => {
    if (newIndex < 0 || newIndex >= images.length) return;
    index = newIndex;
    img.src = getImageUrl(images[index]);
    resetView();
    updateCounter();
  };

  // 鼠标滚轮缩放
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(scale * delta, 20));
    
    const rect = img.getBoundingClientRect();
    const imgCenterX = rect.left + rect.width / 2;
    const imgCenterY = rect.top + rect.height / 2;
    const mouseOffsetX = e.clientX - imgCenterX;
    const mouseOffsetY = e.clientY - imgCenterY;
    
    const scaleRatio = newScale / scale;
    translateX -= mouseOffsetX * (scaleRatio - 1);
    translateY -= mouseOffsetY * (scaleRatio - 1);
    
    scale = newScale;
    updateTransform();
  };

  // 拖拽
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
    lightbox.style.cursor = "grabbing";
    img.style.cursor = "grabbing";
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    translateX = lastTranslateX + (e.clientX - startX);
    translateY = lastTranslateY + (e.clientY - startY);
    updateTransform();
  };

  const handleMouseUp = () => {
    isDragging = false;
    lightbox.style.cursor = "grab";
    img.style.cursor = "grab";
  };

  // 双击重置
  const handleDblClick = (e) => {
    if (e.target === img) {
      resetView();
    }
  };

  // 关闭按钮
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 20px;
    z-index: 10001;
  `;

  // 导航按钮（多图时显示）
  let prevBtn, nextBtn, counter;
  
  if (images.length > 1) {
    prevBtn = document.createElement("button");
    prevBtn.textContent = "‹";
    prevBtn.style.cssText = `
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 30px;
      z-index: 10001;
    `;
    prevBtn.addEventListener("click", () => showImage(index - 1));

    nextBtn = document.createElement("button");
    nextBtn.textContent = "›";
    nextBtn.style.cssText = `
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 30px;
      z-index: 10001;
    `;
    nextBtn.addEventListener("click", () => showImage(index + 1));

    counter = document.createElement("div");
    counter.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10001;
    `;
  }

  const updateCounter = () => {
    if (counter) {
      counter.textContent = `${index + 1} / ${images.length}`;
    }
    if (prevBtn) prevBtn.style.opacity = index === 0 ? "0.3" : "1";
    if (nextBtn) nextBtn.style.opacity = index === images.length - 1 ? "0.3" : "1";
  };

  // 提示信息
  const hint = document.createElement("div");
  hint.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.7);
    color: #999;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10001;
  `;
  hint.textContent = images.length > 1 
    ? "滚轮缩放 · 拖拽移动 · 双击重置 · 左右箭头切换 · ESC关闭"
    : "滚轮缩放 · 拖拽移动 · 双击重置 · ESC关闭";

  const closeLightbox = () => {
    lightbox.removeEventListener("wheel", handleWheel);
    lightbox.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("keydown", handleKeyDown);
    if (document.body.contains(lightbox)) {
      document.body.removeChild(lightbox);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeLightbox();
    } else if (e.key === "ArrowLeft" && images.length > 1) {
      showImage(index - 1);
    } else if (e.key === "ArrowRight" && images.length > 1) {
      showImage(index + 1);
    }
  };

  closeBtn.addEventListener("click", closeLightbox);
  
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  lightbox.addEventListener("wheel", handleWheel, { passive: false });
  lightbox.addEventListener("mousedown", handleMouseDown);
  lightbox.addEventListener("dblclick", handleDblClick);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);

  lightbox.appendChild(img);
  lightbox.appendChild(closeBtn);
  lightbox.appendChild(hint);
  
  if (images.length > 1) {
    lightbox.appendChild(prevBtn);
    lightbox.appendChild(nextBtn);
    lightbox.appendChild(counter);
    updateCounter();
  }

  document.body.appendChild(lightbox);
};

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = ImageViewer;
}
