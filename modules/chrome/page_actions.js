/**
 * 页面操作
 * 负责页面导航、内容获取、资源管理和页面交互。
 * 
 * 功能模块：
 * 1. 页面导航：navigate、getUrl
 * 2. 内容获取：screenshot、getContent、getText、getElements
 * 3. 资源管理：getResources、saveResource
 * 4. 页面交互：click、clickAt、type、fill、evaluate、waitFor
 */

export class PageActions {
  /**
   * @param {{log?: any, tabManager: import('./tab_manager.js').TabManager, runtime?: any}} options
   */
  constructor(options) {
    this.log = options.log ?? console;
    this.tabManager = options.tabManager;
    this.runtime = options.runtime;
  }

  /**
   * 获取页面对象，如果不存在返回错误
   * @param {string} tabId
   * @returns {{page: import('puppeteer-core').Page} | {error: string, tabId: string}}
   */
  _getPage(tabId) {
    const page = this.tabManager.getPage(tabId);
    if (!page) {
      return { error: "tab_not_found", tabId };
    }
    return { page };
  }

  /**
   * 清理选择器字符串，移除多余的引号和空白
   * @param {string} selector - 原始选择器
   * @returns {{original: string, cleaned: string, modified: boolean}}
   */
  _sanitizeSelector(selector) {
    // 处理 null/undefined 情况
    if (selector == null) {
      return { original: selector, cleaned: selector, modified: false };
    }
    
    const original = selector;
    let cleaned = String(selector).trim();
    
    // 移除首尾的双引号
    if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
      cleaned = cleaned.slice(1, -1);
    }
    // 移除首尾的单引号
    else if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // 再次 trim 以处理引号内的空白
    cleaned = cleaned.trim();
    
    return {
      original,
      cleaned,
      modified: original !== cleaned
    };
  }

  // ==================== 页面导航 ====================

  /**
   * 导航到指定 URL
   * @param {string} tabId
   * @param {string} url
   * @param {{waitUntil?: string, timeoutMs?: number}} options
   */
  async navigate(tabId, url, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { waitUntil = "load", timeoutMs = 30000 } = options;

    this.log.info?.("导航到 URL", { tabId, url, waitUntil });

    try {
      await page.goto(url, {
        waitUntil,
        timeout: timeoutMs
      });

      const finalUrl = page.url();
      const title = await page.title();

      return { ok: true, url: finalUrl, title };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "navigation_timeout", url, timeoutMs, message };
      }
      return { error: "navigation_failed", url, message };
    }
  }

  /**
   * 获取当前 URL
   * @param {string} tabId
   */
  async getUrl(tabId) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const url = page.url();
    return { ok: true, url };
  }

  // ==================== 内容获取 ====================

  /**
   * 获取页面截图并保存为 JPEG 图片文件
   * @param {string} tabId
   * @param {{fullPage?: boolean, selector?: string, ctx?: any, workspacePath?: string, runtime?: any}} options
   */
  async screenshot(tabId, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { fullPage = false, selector, ctx, workspacePath, runtime } = options;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    this.log.info?.("获取截图", { tabId, fullPage, selector: cleanedSelector });

    try {
      let screenshotBuffer;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        screenshotBuffer = await element.screenshot({ type: "jpeg", quality: 80 });
      } else {
        screenshotBuffer = await page.screenshot({
          fullPage,
          type: "jpeg",
          quality: 80
        });
      }

    // 如果提供了 workspacePath，则保存到工作区
    if (workspacePath && ctx) {
      const runtime = this.runtime;
      if (runtime) {
        const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
        if (workspaceId) {
          const ws = await runtime.workspaceManager.getWorkspace(workspaceId);
          await ws.writeFile(workspacePath, screenshotBuffer, { 
            mimeType: "image/jpeg",
            operator: ctx.agent?.id,
            messageId: ctx.currentMessage?.id,
            meta: {
              source: "chrome-screenshot",
              url: page.url(),
              title: await page.title(),
              fullPage,
              selector: cleanedSelector || null
            }
          });
          return {
            ok: true,
            path: workspacePath,
            url: page.url(),
            title: await page.title(),
            fullPage,
            selector: cleanedSelector || null
          };
        }
      }
    }

    // 只有在没有保存到文件时才返回 base64（用于 HTTP API 预览或单次临时查看）
    return { ok: true, screenshot: screenshotBuffer.toString('base64'), format: "jpeg" };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "screenshot_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  /**
   * 获取页面 HTML 内容
   * @param {string} tabId
   * @param {string} [selector]
   */
  async getContent(tabId, selector) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    try {
      let html;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        html = await page.evaluate(el => el.outerHTML, element);
      } else {
        html = await page.content();
      }

      return { ok: true, html };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_content_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  /**
   * 获取页面纯文本内容
   * @param {string} tabId
   * @param {string} [selector]
   */
  async getText(tabId, selector) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    try {
      let text;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        text = await page.evaluate(el => el.innerText || el.textContent, element);
      } else {
        text = await page.evaluate(() => document.body.innerText || document.body.textContent);
      }

      return { ok: true, text };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_text_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  /**
   * 获取页面可交互元素的结构化信息
   * @param {string} tabId
   * @param {{selector?: string, types?: string[], maxElements?: number}} options
   */
  async getElements(tabId, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { types, maxElements = 1000 } = options;

    // 清理选择器（如果提供）
    let cleanedSelector = options.selector;
    let originalSelector;
    let selectorModified = false;
    if (options.selector) {
      const sanitized = this._sanitizeSelector(options.selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    // 类型别名映射：查询某类型时自动包含相关类型
    const typeAliases = {
      input: ['input', 'textarea'],           // 输入类控件
      button: ['button'],                      // 按钮类
      link: ['link','a'],              // 链接类
      text: ['text','span','p','div'],                          // 文本类
      image: ['image','img'],                        // 图片类
      select: ['select', 'checkbox', 'radio','option'], // 选择类控件
      checkbox: ['checkbox'],
      radio: ['radio'],
      textarea: ['textarea']
    };

    // 展开类型别名
    let expandedTypes = types;
    if (types && types.length > 0) {
      const typeSet = new Set();
      for (const t of types) {
        const aliases = typeAliases[t] || [t];
        aliases.forEach(a => typeSet.add(a));
      }
      expandedTypes = Array.from(typeSet);
    }

    this.log.info?.("获取页面元素", { tabId, selector: cleanedSelector, types, expandedTypes, maxElements });

    try {
      const elements = await page.evaluate((opts) => {
        const { rootSelector, filterTypes, limit } = opts;
        
        // 获取根元素
        const root = rootSelector ? document.querySelector(rootSelector) : document.body;
        if (!root) return { error: "root_not_found" };

        const results = [];
        
        // 检查元素是否可见
        function isVisible(el) {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }

        // 生成元素的唯一选择器
        function getSelector(el) {
          // 优先使用 id
          if (el.id) {
            return `#${CSS.escape(el.id)}`;
          }
          
          // 尝试使用 name 属性
          if (el.name) {
            const byName = document.querySelectorAll(`[name="${CSS.escape(el.name)}"]`);
            if (byName.length === 1) {
              return `[name="${el.name}"]`;
            }
          }
          
          // 使用标签名 + 类名 + nth-child
          let selector = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
            if (classes.length > 0) {
              selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
            }
          }
          
          // 添加 nth-child 确保唯一性
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(el) + 1;
              selector += `:nth-child(${index})`;
            }
          }
          
          return selector;
        }

        // 获取元素的文本内容（截断）
        function getText(el, maxLen = 100) {
          const text = (el.innerText || el.textContent || '').trim();
          return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
        }

        // 获取元素位置信息
        function getPosition(el) {
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        }

        // 处理链接
        function processLinks() {
          if (filterTypes && !filterTypes.includes('link')) return;
          root.querySelectorAll('a[href]').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'link',
              selector: getSelector(el),
              text: getText(el),
              href: el.href,
              position: getPosition(el)
            });
          });
        }

        // 处理按钮
        function processButtons() {
          if (filterTypes && !filterTypes.includes('button')) return;
          // button 标签
          root.querySelectorAll('button').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'button',
              selector: getSelector(el),
              text: getText(el),
              disabled: el.disabled,
              position: getPosition(el)
            });
          });
          // input[type=button/submit/reset]
          root.querySelectorAll('input[type="button"], input[type="submit"], input[type="reset"]').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'button',
              selector: getSelector(el),
              text: el.value || el.placeholder || '',
              disabled: el.disabled,
              position: getPosition(el)
            });
          });
          // role="button"
          root.querySelectorAll('[role="button"]').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            if (el.tagName === 'BUTTON') return; // 避免重复
            results.push({
              type: 'button',
              selector: getSelector(el),
              text: getText(el),
              position: getPosition(el)
            });
          });
        }

        // 处理输入框
        function processInputs() {
          if (filterTypes && !filterTypes.includes('input')) return;
          root.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'input',
              selector: getSelector(el),
              inputType: el.type || 'text',
              name: el.name || null,
              placeholder: el.placeholder || null,
              value: el.type === 'password' ? '***' : (el.value || null),
              disabled: el.disabled,
              readonly: el.readOnly,
              position: getPosition(el)
            });
          });
        }

        // 处理文本域
        function processTextareas() {
          if (filterTypes && !filterTypes.includes('textarea')) return;
          root.querySelectorAll('textarea').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'textarea',
              selector: getSelector(el),
              name: el.name || null,
              placeholder: el.placeholder || null,
              value: getText(el, 200),
              disabled: el.disabled,
              readonly: el.readOnly,
              position: getPosition(el)
            });
          });
        }

        // 处理下拉框
        function processSelects() {
          if (filterTypes && !filterTypes.includes('select')) return;
          root.querySelectorAll('select').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            const options = Array.from(el.options).map(opt => ({
              value: opt.value,
              text: opt.text,
              selected: opt.selected
            }));
            results.push({
              type: 'select',
              selector: getSelector(el),
              name: el.name || null,
              options: options.slice(0, 20), // 限制选项数量
              selectedValue: el.value,
              disabled: el.disabled,
              position: getPosition(el)
            });
          });
        }

        // 处理复选框
        function processCheckboxes() {
          if (filterTypes && !filterTypes.includes('checkbox')) return;
          root.querySelectorAll('input[type="checkbox"]').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            // 尝试获取关联的 label
            let label = '';
            if (el.id) {
              const labelEl = document.querySelector(`label[for="${el.id}"]`);
              if (labelEl) label = getText(labelEl);
            }
            if (!label && el.parentElement?.tagName === 'LABEL') {
              label = getText(el.parentElement);
            }
            results.push({
              type: 'checkbox',
              selector: getSelector(el),
              name: el.name || null,
              label: label || null,
              checked: el.checked,
              disabled: el.disabled,
              position: getPosition(el)
            });
          });
        }

        // 处理单选框
        function processRadios() {
          if (filterTypes && !filterTypes.includes('radio')) return;
          root.querySelectorAll('input[type="radio"]').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            let label = '';
            if (el.id) {
              const labelEl = document.querySelector(`label[for="${el.id}"]`);
              if (labelEl) label = getText(labelEl);
            }
            if (!label && el.parentElement?.tagName === 'LABEL') {
              label = getText(el.parentElement);
            }
            results.push({
              type: 'radio',
              selector: getSelector(el),
              name: el.name || null,
              value: el.value || null,
              label: label || null,
              checked: el.checked,
              disabled: el.disabled,
              position: getPosition(el)
            });
          });
        }

        // 处理图片
        function processImages() {
          if (filterTypes && !filterTypes.includes('image')) return;
          root.querySelectorAll('img').forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            results.push({
              type: 'image',
              selector: getSelector(el),
              src: el.src,
              alt: el.alt || null,
              position: getPosition(el)
            });
          });
        }

        // 处理文本块（标题、段落等）
        function processTexts() {
          if (filterTypes && !filterTypes.includes('text')) return;
          const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, div, li, td, th, label';
          root.querySelectorAll(textSelectors).forEach(el => {
            if (!isVisible(el) || results.length >= limit) return;
            // 只处理叶子节点或直接包含文本的元素
            const directText = Array.from(el.childNodes)
              .filter(n => n.nodeType === Node.TEXT_NODE)
              .map(n => n.textContent.trim())
              .join(' ')
              .trim();
            if (!directText || directText.length < 2) return;
            // 避免重复（已经作为其他类型处理的元素）
            if (el.tagName === 'LABEL' && el.htmlFor) return;
            results.push({
              type: 'text',
              selector: getSelector(el),
              tag: el.tagName.toLowerCase(),
              text: getText(el, 200),
              position: getPosition(el)
            });
          });
        }

        // 按优先级处理各类元素
        processButtons();
        processLinks();
        processInputs();
        processTextareas();
        processSelects();
        processCheckboxes();
        processRadios();
        processImages();
        processTexts();

        return results;
      }, {
        rootSelector: cleanedSelector,
        filterTypes: expandedTypes,
        limit: maxElements
      });

      if (elements.error) {
        return { error: elements.error, selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
      }

      return { 
        ok: true, 
        elements,
        count: elements.length,
        truncated: elements.length >= maxElements
      };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_elements_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  // ==================== 资源管理 ====================

  /**
   * 获取页面上的资源列表
   * @param {string} tabId
   * @param {{types?: string[], includeDataUrls?: boolean}} options
   * @returns {Promise<{ok: boolean, resources?: Array, error?: string}>}
   */
  async getResources(tabId, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { types = ['image'], includeDataUrls = false } = options;

    this.log.info?.("获取页面资源", { tabId, types, includeDataUrls });

    try {
      const resources = await page.evaluate((opts) => {
        const { resourceTypes, includeData } = opts;
        const results = [];

        // 获取图片资源
        if (resourceTypes.includes('image')) {
          document.querySelectorAll('img').forEach((img, index) => {
            const src = img.src || img.dataset.src;
            if (!src) return;
            
            // 过滤 data URL（如果不需要）
            if (!includeData && src.startsWith('data:')) return;
            
            const rect = img.getBoundingClientRect();
            results.push({
              type: 'image',
              index,
              src,
              alt: img.alt || '',
              width: img.naturalWidth || rect.width,
              height: img.naturalHeight || rect.height,
              visible: rect.width > 0 && rect.height > 0,
              selector: img.id ? `#${img.id}` : `img:nth-of-type(${index + 1})`
            });
          });
        }

        // 获取背景图片
        if (resourceTypes.includes('background')) {
          document.querySelectorAll('*').forEach((el, index) => {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none') {
              const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
              if (urlMatch && urlMatch[1]) {
                const url = urlMatch[1];
                if (!includeData && url.startsWith('data:')) return;
                
                results.push({
                  type: 'background',
                  index,
                  src: url,
                  element: el.tagName.toLowerCase(),
                  selector: el.id ? `#${el.id}` : null
                });
              }
            }
          });
        }

        // 获取CSS资源
        if (resourceTypes.includes('css')) {
          document.querySelectorAll('link[rel="stylesheet"]').forEach((link, index) => {
            results.push({
              type: 'css',
              index,
              src: link.href,
              media: link.media || 'all'
            });
          });
        }

        // 获取JavaScript资源
        if (resourceTypes.includes('script')) {
          document.querySelectorAll('script[src]').forEach((script, index) => {
            results.push({
              type: 'script',
              index,
              src: script.src,
              async: script.async,
              defer: script.defer
            });
          });
        }

        // 获取视频资源
        if (resourceTypes.includes('video')) {
          document.querySelectorAll('video').forEach((video, index) => {
            const sources = Array.from(video.querySelectorAll('source')).map(s => ({
              src: s.src,
              type: s.type
            }));
            
            results.push({
              type: 'video',
              index,
              src: video.src || (sources.length > 0 ? sources[0].src : ''),
              sources,
              poster: video.poster || null,
              selector: video.id ? `#${video.id}` : `video:nth-of-type(${index + 1})`
            });
          });
        }

        // 获取音频资源
        if (resourceTypes.includes('audio')) {
          document.querySelectorAll('audio').forEach((audio, index) => {
            const sources = Array.from(audio.querySelectorAll('source')).map(s => ({
              src: s.src,
              type: s.type
            }));
            
            results.push({
              type: 'audio',
              index,
              src: audio.src || (sources.length > 0 ? sources[0].src : ''),
              sources,
              selector: audio.id ? `#${audio.id}` : `audio:nth-of-type(${index + 1})`
            });
          });
        }

        return results;
      }, {
        resourceTypes: types,
        includeData: includeDataUrls
      });

      return {
        ok: true,
        resources,
        count: resources.length,
        url: page.url()
      };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_resources_failed", message };
    }
  }

  /**
   * 保存页面资源到工件
   * 支持单个或多个资源URL，返回工件ID数组
   * 
   * @param {string} tabId - 标签页ID
   * @param {string|string[]} resourceUrls - 资源URL或URL数组
   * @param {{ctx?: any, resourceNames?: string[], type?: string}} options - 选项
   * @returns {Promise<{ok: boolean, artifactIds?: string[], errors?: Array, error?: string}>}
   */
  /**
   * 保存页面资源到工作区
   * @param {string} tabId
   * @param {Array<{url: string, name: string}>} resources - 资源列表，每个对象包含 url 和 name
   * @param {{ctx?: any, type?: string, workspacePath?: string}} options
   */
  async saveResource(tabId, resources, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { ctx, type = 'image', workspacePath = 'downloads' } = options;

    // 统一处理为数组
    const resourceArray = Array.isArray(resources) ? resources : (resources ? [resources] : []);
    
    if (resourceArray.length === 0) {
      return { error: "empty_resources", message: "资源列表不能为空" };
    }

    // 验证所有资源都有 url 和 name
    for (let i = 0; i < resourceArray.length; i++) {
      const res = resourceArray[i];
      if (!res.url || typeof res.url !== 'string') {
        return { error: "invalid_resource_url", message: `资源[${i}]的 URL 不能为空` };
      }
      if (!res.name || typeof res.name !== 'string' || res.name.trim() === '') {
        return { error: "invalid_resource_name", message: `资源[${i}]的名称不能为空` };
      }
    }

    this.log.info?.("保存页面资源", { tabId, count: resourceArray.length, type, workspacePath });

    // 统计成功和失败数量
    const savedPaths = [];
    const errors = [];

    // 获取工作区
    let ws = null;
    if (ctx && this.runtime) {
      const workspaceId = this.runtime.findWorkspaceIdForAgent(ctx.agent?.id);
      if (workspaceId) {
        ws = await this.runtime.workspaceManager.getWorkspace(workspaceId);
      }
    }

    if (!ws) {
      return { error: "workspace_not_found", message: "无法获取工作空间，请确保智能体已分配工作空间" };
    }

    // 用于网络资源下载的临时页面，确保使用浏览器的 Cookie 和 Session
    let tempPage = null;

    try {
      // 逐个处理资源
      for (let i = 0; i < resourceArray.length; i++) {
        const { url: resourceUrl, name: resourceName } = resourceArray[i];
        
        try {
          // 获取资源内容
          let buffer;
          let mimeType = null;
          
          if (resourceUrl.startsWith('data:')) {
            // 处理 data URL
            const matches = resourceUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              errors.push({ 
                index: i, 
                resourceUrl, 
                error: "invalid_data_url" 
              });
              savedPaths.push(null);
              continue;
            }
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
          } else {
            // 使用浏览器导航方式下载资源，确保 Cookie 和 Session 一致，并绕过 CORS 限制
            if (!tempPage) {
              const browserContext = page.browserContext();
              tempPage = await browserContext.newPage();
            }
            
            this.log.info?.("通过浏览器下载资源", { index: i, url: resourceUrl });
            
            // 导航到资源 URL
            const response = await tempPage.goto(resourceUrl, { 
                waitUntil: 'load', 
                timeout: 30000 
            });

            if (!response || !response.ok()) {
              errors.push({ 
                index: i, 
                resourceUrl, 
                error: "fetch_resource_failed", 
                message: response ? `HTTP ${response.status()}` : "无响应" 
              });
              savedPaths.push(null);
              continue;
            }

            buffer = await response.buffer();
            mimeType = response.headers()['content-type'];
          }

          // 确定文件后缀
          let ext = 'png';
          if (mimeType) {
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
            else if (mimeType.includes('gif')) ext = 'gif';
            else if (mimeType.includes('webp')) ext = 'webp';
            else if (mimeType.includes('png')) ext = 'png';
            else if (mimeType.includes('svg')) ext = 'svg';
          } else {
            if (resourceUrl.includes('.jpg') || resourceUrl.includes('.jpeg')) {
              ext = 'jpg';
            } else if (resourceUrl.includes('.gif')) {
              ext = 'gif';
            } else if (resourceUrl.includes('.webp')) {
              ext = 'webp';
            }
          }

          // 构建保存路径
          let finalPath = resourceName;
          if (!finalPath.includes('.')) {
            finalPath += `.${ext}`;
          }
          
          // 如果提供了 workspacePath，则作为目录
          const fullPath = workspacePath ? 
            (workspacePath.endsWith('/') ? `${workspacePath}${finalPath}` : `${workspacePath}/${finalPath}`) : 
            finalPath;

          // 保存到工作区
          await ws.writeFile(fullPath, buffer, { mimeType });
          savedPaths.push(fullPath);

        } catch (err) {
          const message = err?.message ?? String(err);
          this.log.error?.("保存资源失败", { index: i, resourceUrl, resourceName, error: message });
          errors.push({ 
            index: i, 
            resourceUrl, 
            resourceName,
            error: "save_resource_failed", 
            message 
          });
          savedPaths.push(null);
        }
      }
    } finally {
      // 确保关闭临时页面
      if (tempPage) {
        await tempPage.close().catch(() => {});
      }
    }

    // 统计成功和失败数量
    const successCount = savedPaths.filter(p => p !== null).length;
    const failureCount = errors.length;

    return {
      ok: true,
      paths: savedPaths,
      successCount,
      failureCount,
      errors: errors.length > 0 ? errors : undefined,
      totalCount: resourceArray.length
    };
  }

  // ==================== 页面交互 ====================

  /**
   * 点击页面元素
   * @param {string} tabId
   * @param {string} selector
   * @param {{waitForSelector?: boolean, timeoutMs?: number}} options
   */
  async click(tabId, selector, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { waitForSelector = true, timeoutMs = 5000 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("点击元素", { tabId, selector: cleaned });

    try {
      if (waitForSelector) {
        await page.waitForSelector(cleaned, { timeout: timeoutMs });
      }
      
      await page.click(cleaned);
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "wait_timeout", selector: cleaned, originalSelector: modified ? original : undefined, timeoutMs };
      }
      return { error: "click_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 在页面指定坐标位置点击
   * @param {string} tabId
   * @param {number} x - X 坐标（像素）
   * @param {number} y - Y 坐标（像素）
   * @param {{button?: 'left' | 'right' | 'middle', clickCount?: number}} options
   */
  async clickAt(tabId, x, y, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { button = "left", clickCount = 1 } = options;

    this.log.info?.("按坐标点击", { tabId, x, y, button, clickCount });

    try {
      await page.mouse.click(x, y, { button, clickCount });
      return { ok: true, x, y, button, clickCount };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "click_at_failed", x, y, message };
    }
  }

  /**
   * 在元素中输入文本（追加模式）
   * @param {string} tabId
   * @param {string} selector
   * @param {string} text
   * @param {{delay?: number}} options
   */
  async type(tabId, selector, text, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { delay = 0 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("输入文本", { tabId, selector: cleaned, textLength: text?.length });

    try {
      await page.waitForSelector(cleaned, { timeout: 5000 });
      await page.type(cleaned, text, { delay });
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      return { error: "type_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 清空输入框并填入新文本
   * @param {string} tabId
   * @param {string} selector
   * @param {string} value
   */
  async fill(tabId, selector, value) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("填充文本", { tabId, selector: cleaned, valueLength: value?.length });

    try {
      await page.waitForSelector(cleaned, { timeout: 5000 });
      
      // 清空现有内容
      await page.$eval(cleaned, el => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = "";
        }
      });
      
      // 填入新值
      await page.type(cleaned, value);
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      return { error: "fill_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 在页面上下文中执行 JavaScript 代码
   * @param {string} tabId
   * @param {string} script
   */
  async evaluate(tabId, script) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    this.log.info?.("执行脚本", { tabId, scriptLength: script?.length });

    try {
      // 使用 Function 构造器来执行脚本字符串
      const evalResult = await page.evaluate((code) => {
        return new Function(code)();
      }, script);
      
      return { ok: true, result: evalResult };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "evaluate_error", message };
    }
  }

  /**
   * 等待元素出现或满足条件
   * @param {string} tabId
   * @param {string} selector
   * @param {{state?: string, timeoutMs?: number}} options
   */
  async waitFor(tabId, selector, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { state = "visible", timeoutMs = 30000 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("等待元素", { tabId, selector: cleaned, state });

    try {
      const waitOptions = { timeout: timeoutMs };
      
      switch (state) {
        case "attached":
          await page.waitForSelector(cleaned, { ...waitOptions });
          break;
        case "detached":
          await page.waitForSelector(cleaned, { ...waitOptions, hidden: true });
          break;
        case "visible":
          await page.waitForSelector(cleaned, { ...waitOptions, visible: true });
          break;
        case "hidden":
          await page.waitForSelector(cleaned, { ...waitOptions, hidden: true });
          break;
        default:
          await page.waitForSelector(cleaned, { ...waitOptions, visible: true });
      }
      
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "wait_timeout", selector: cleaned, originalSelector: modified ? original : undefined, state, timeoutMs };
      }
      return { error: "wait_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }
}
