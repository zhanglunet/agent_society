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
    lightbox.style.position = "fixed";
    lightbox.style.top = "0";
    lightbox.style.left = "0";
    lightbox.style.width = "100%";
    lightbox.style.height = "100%";
    lightbox.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    lightbox.style.display = "flex";
    lightbox.style.alignItems = "center";
    lightbox.style.justifyContent = "center";
    lightbox.style.zIndex = "10000";

    // 图片容器
    const imgContainer = document.createElement("div");
    imgContainer.style.position = "relative";
    imgContainer.style.maxWidth = "90%";
    imgContainer.style.maxHeight = "90%";
    imgContainer.style.overflow = "auto";

    const img = document.createElement("img");
    img.src = imageSrc;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.display = "block";

    imgContainer.appendChild(img);

    // 控制栏
    const controls = document.createElement("div");
    controls.style.position = "absolute";
    controls.style.bottom = "20px";
    controls.style.left = "50%";
    controls.style.transform = "translateX(-50%)";
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    controls.style.padding = "10px";
    controls.style.borderRadius = "4px";

    // 缩放按钮
    const zoomInBtn = this._createButton("放大", () => {
      this.currentZoom += 0.2;
      img.style.transform = `scale(${this.currentZoom})`;
    });

    const zoomOutBtn = this._createButton("缩小", () => {
      if (this.currentZoom > 0.2) {
        this.currentZoom -= 0.2;
        img.style.transform = `scale(${this.currentZoom})`;
      }
    });

    const fitBtn = this._createButton("适应", () => {
      this.currentZoom = 1;
      img.style.transform = "scale(1)";
    });

    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(fitBtn);

    imgContainer.appendChild(controls);

    // 关闭按钮
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "20px";
    closeBtn.style.right = "20px";
    closeBtn.style.width = "40px";
    closeBtn.style.height = "40px";
    closeBtn.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    closeBtn.style.color = "white";
    closeBtn.style.border = "none";
    closeBtn.style.borderRadius = "4px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "20px";
    closeBtn.addEventListener("click", () => {
      document.body.removeChild(lightbox);
    });

    imgContainer.appendChild(closeBtn);
    lightbox.appendChild(imgContainer);

    // 点击外部关闭
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) {
        document.body.removeChild(lightbox);
      }
    });

    // Escape键关闭
    const closeOnEscape = (e) => {
      if (e.key === "Escape") {
        if (document.body.contains(lightbox)) {
          document.body.removeChild(lightbox);
        }
        document.removeEventListener("keydown", closeOnEscape);
      }
    };
    document.addEventListener("keydown", closeOnEscape);

    document.body.appendChild(lightbox);
  }

  /**
   * 创建按钮
   */
  _createButton(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.padding = "8px 16px";
    btn.style.backgroundColor = "#07c160";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.addEventListener("click", onClick);
    return btn;
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

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = ImageViewer;
}
