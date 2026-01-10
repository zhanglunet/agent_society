/**
 * 图片格式转换器
 * 负责将非JPEG格式的图片转换为JPEG格式
 * 支持浏览器能够解码的所有图片格式
 * 
 * Requirements: 1.3, 3.1, 3.2, 3.3, 3.4
 */

const ImageConverter = {
  /**
   * 默认JPEG压缩质量
   */
  DEFAULT_QUALITY: 0.85,

  /**
   * 检查文件是否为JPEG格式
   * @param {File} file - 文件对象
   * @returns {boolean}
   */
  isJpeg(file) {
    return file.type === 'image/jpeg' || file.type === 'image/jpg';
  },

  /**
   * 检查文件是否为浏览器支持的图片格式
   * 通过尝试加载图片来验证，而不是检查MIME类型列表
   * @param {File} file - 文件对象
   * @returns {Promise<boolean>}
   */
  async isSupportedImage(file) {
    // 检查文件类型是否以 'image/' 开头
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return false;
    }
    
    // 尝试加载图片来验证浏览器是否支持该格式
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(true);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      
      img.src = url;
    });
  },

  /**
   * 将图片文件转换为JPEG格式
   * @param {File} file - 原始图片文件
   * @param {number} quality - JPEG质量 (0-1)，默认0.85
   * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number}>} 转换后的JPEG数据
   * @throws {Error} 如果图片加载或转换失败
   */
  async convertToJpeg(file, quality = this.DEFAULT_QUALITY) {
    // 验证参数
    if (!file) {
      throw new Error('文件不能为空');
    }
    
    // 确保质量参数在有效范围内
    const safeQuality = Math.max(0, Math.min(1, quality));
    
    // 如果已经是JPEG且质量足够，直接返回
    if (this.isJpeg(file) && safeQuality >= this.DEFAULT_QUALITY) {
      const dataUrl = await this._fileToDataUrl(file);
      const dimensions = await this._getImageDimensions(file);
      return {
        blob: file,
        dataUrl,
        width: dimensions.width,
        height: dimensions.height
      };
    }
    
    // 加载图片
    const img = await this._loadImage(file);
    
    // 创建Canvas并绘制图片
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建Canvas上下文');
    }
    
    // 绘制白色背景（处理透明PNG）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制图片
    ctx.drawImage(img, 0, 0);
    
    // 导出为JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', safeQuality);
    const blob = await this._dataUrlToBlob(dataUrl);
    
    return {
      blob,
      dataUrl,
      width: img.width,
      height: img.height
    };
  },

  /**
   * 加载图片文件
   * @param {File} file - 图片文件
   * @returns {Promise<HTMLImageElement>}
   * @private
   */
  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败，可能是不支持的格式'));
      };
      
      img.src = url;
    });
  },

  /**
   * 将文件转换为DataURL
   * @param {File} file - 文件对象
   * @returns {Promise<string>}
   * @private
   */
  _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        resolve(reader.result);
      };
      
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      
      reader.readAsDataURL(file);
    });
  },

  /**
   * 将DataURL转换为Blob
   * @param {string} dataUrl - DataURL字符串
   * @returns {Promise<Blob>}
   * @private
   */
  async _dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  },

  /**
   * 获取图片尺寸
   * @param {File} file - 图片文件
   * @returns {Promise<{width: number, height: number}>}
   * @private
   */
  _getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('无法获取图片尺寸'));
      };
      
      img.src = url;
    });
  },

  /**
   * 创建图片缩略图
   * @param {File} file - 图片文件
   * @param {number} maxWidth - 最大宽度
   * @param {number} maxHeight - 最大高度
   * @returns {Promise<string>} 缩略图DataURL
   */
  async createThumbnail(file, maxWidth = 100, maxHeight = 100) {
    const img = await this._loadImage(file);
    
    // 计算缩放比例
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    
    // 创建Canvas并绘制缩略图
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建Canvas上下文');
    }
    
    // 绘制白色背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // 绘制缩放后的图片
    ctx.drawImage(img, 0, 0, width, height);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  }
};

// 导出供其他模块使用
window.ImageConverter = ImageConverter;
