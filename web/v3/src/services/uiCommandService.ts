/**
 * UI 命令服务
 * 
 * 职责：
 * - 轮询服务器获取待执行的 UI 命令
 * - 在页面上下文中执行 JavaScript、获取内容、DOM 补丁
 * - 将执行结果返回给服务器
 * 
 * 安全说明：
 * - eval_js 会直接在页面上下文中执行代码，具有完整 window/document 访问权限
 * - 该功能仅供智能体控制自身界面使用，不对外暴露
 * 
 * @author Agent Society
 */



// 命令类型定义
interface UiCommand {
    id: string;
    type: 'eval_js' | 'get_content' | 'dom_patch';
    payload: any;
}

// 命令执行结果
interface CommandResult {
    ok: boolean;
    result?: any;
    error?: string;
}

// DOM 补丁操作
interface DomOperation {
    op: string;
    selector?: string;
    name?: string;
    value?: string;
    position?: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
}

class UiCommandService {
    private clientId: string;
    private isRunning: boolean = false;
    private abortController: AbortController | null = null;
    private readonly POLL_TIMEOUT = 25000; // 25秒长轮询
    private readonly POLL_INTERVAL = 1000; // 正常轮询间隔

    constructor() {
        // 生成唯一客户端 ID
        this.clientId = this.generateClientId();
    }

    /**
     * 生成唯一客户端 ID
     */
    private generateClientId(): string {
        const random = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now().toString(36);
        return `v3-${timestamp}-${random}`;
    }

    /**
     * 启动命令轮询
     */
    start(): void {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.abortController = new AbortController();
        
        console.log('[UiCommandService] 启动，客户端 ID:', this.clientId);
        this.pollLoop();
    }

    /**
     * 停止命令轮询
     */
    stop(): void {
        this.isRunning = false;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        console.log('[UiCommandService] 已停止');
    }

    /**
     * 轮询循环
     */
    private async pollLoop(): Promise<void> {
        while (this.isRunning) {
            try {
                const command = await this.fetchCommand();
                
                if (command) {
                    console.log('[UiCommandService] 收到命令:', command.type, command.id);
                    const result = await this.executeCommand(command);
                    await this.sendResult(command.id, result);
                }
            } catch (err) {
                // 如果是中止信号，直接退出
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }
                console.error('[UiCommandService] 轮询错误:', err);
                // 出错后等待一段时间再重试
                await this.sleep(this.POLL_INTERVAL);
            }
        }
    }

    /**
     * 获取待执行命令
     */
    private async fetchCommand(): Promise<UiCommand | null> {
        const url = `/api/ui-commands/poll?clientId=${encodeURIComponent(this.clientId)}&timeoutMs=${this.POLL_TIMEOUT}`;
        
        const response = await fetch(url, {
            method: 'GET',
            signal: this.abortController?.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(data.error || 'Unknown error');
        }

        return data.command;
    }

    /**
     * 执行命令
     */
    private async executeCommand(command: UiCommand): Promise<CommandResult> {
        try {
            switch (command.type) {
                case 'eval_js':
                    return this.executeEvalJs(command.payload);
                case 'get_content':
                    return this.executeGetContent(command.payload);
                case 'dom_patch':
                    return this.executeDomPatch(command.payload);
                default:
                    return { ok: false, error: `Unknown command type: ${command.type}` };
            }
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            console.error('[UiCommandService] 命令执行失败:', command.type, error);
            return { ok: false, error };
        }
    }

    /**
     * 执行 JavaScript 代码
     * 
     * 在页面上下文中执行，具有完整的 window/document 访问权限
     */
    private executeEvalJs(payload: { script: string }): CommandResult {
        const script = payload?.script;
        
        if (typeof script !== 'string') {
            return { ok: false, error: 'Missing or invalid script parameter' };
        }

        // 创建函数并执行，传入 window 对象以确保最大权限
        const fn = new Function('window', 'document', `
            "use strict";
            return (async () => {
                ${script}
            })();
        `);

        const result = fn(window, document);

        // 处理 Promise 返回值
        if (result && typeof result === 'object' && typeof result.then === 'function') {
            return result.then(
                (value: any) => ({ ok: true, result: this.serializeResult(value) }),
                (err: any) => ({ ok: false, error: String(err) })
            );
        }

        return { ok: true, result: this.serializeResult(result) };
    }

    /**
     * 获取页面内容
     */
    private executeGetContent(payload: { 
        selector?: string | null; 
        format?: string; 
        maxChars?: number;
    }): CommandResult {
        const selector = payload?.selector;
        const format = payload?.format || 'summary';
        const maxChars = payload?.maxChars || 20000;

        let element: Element | Document | null = document;
        
        if (selector) {
            element = document.querySelector(selector);
            if (!element) {
                return { ok: false, error: `Element not found: ${selector}` };
            }
        }

        let content: string;

        switch (format) {
            case 'html':
                content = element instanceof Document 
                    ? element.documentElement.outerHTML 
                    : (element as Element).outerHTML;
                break;
            case 'text':
                content = element instanceof Document 
                    ? element.body.innerText 
                    : (element as Element).textContent || '';
                break;
            case 'summary':
                content = this.generateContentSummary(element, maxChars);
                break;
            default:
                return { ok: false, error: `Unknown format: ${format}` };
        }

        // 截断内容
        if (content.length > maxChars) {
            content = content.substring(0, maxChars) + '\n... (truncated)';
        }

        return { ok: true, result: content };
    }

    /**
     * 生成内容摘要
     */
    private generateContentSummary(element: Element | Document, maxChars: number): string {
        const parts: string[] = [];
        
        // 收集可见元素的文本和属性
        const elements = element.querySelectorAll('*');
        let charCount = 0;

        for (const el of Array.from(elements)) {
            // 跳过脚本、样式、隐藏元素
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
            
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            // 收集交互元素
            const tagName = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className && typeof el.className === 'string' 
                ? el.className.split(' ').filter(c => c).map(c => `.${c}`).join('') 
                : '';

            if (['button', 'a', 'input', 'textarea', 'select'].includes(tagName) || (el as HTMLElement).onclick) {
                const text = el.textContent?.trim() || '';
                const href = (el as HTMLAnchorElement).href;
                const type = (el as HTMLInputElement).type;
                
                let desc = `<${tagName}${id}${classes}>`;
                if (text) desc += ` text="${text.substring(0, 50)}"`;
                if (href) desc += ` href="${href}"`;
                if (type) desc += ` type="${type}"`;
                
                if (charCount + desc.length > maxChars) break;
                parts.push(desc);
                charCount += desc.length;
            }
        }

        return parts.join('\n');
    }

    /**
     * 执行 DOM 补丁
     */
    private executeDomPatch(payload: { operations: DomOperation[] }): CommandResult {
        const operations = payload?.operations;
        
        if (!Array.isArray(operations)) {
            return { ok: false, error: 'Missing or invalid operations parameter' };
        }

        const results: { index: number; success: boolean; error?: string }[] = [];

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            if (!op) continue;
            try {
                this.applyDomOperation(op);
                results.push({ index: i, success: true });
            } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                results.push({ index: i, success: false, error });
            }
        }

        const hasError = results.some(r => !r.success);
        return {
            ok: !hasError,
            result: results,
            error: hasError ? 'Some operations failed' : undefined
        };
    }

    /**
     * 应用单个 DOM 操作
     */
    private applyDomOperation(op: DomOperation): void {
        const { op: operation, selector, name, value, position } = op;

        switch (operation) {
            case 'setText': {
                const el = this.getElement(selector);
                el.textContent = value || '';
                break;
            }
            case 'setHtml': {
                const el = this.getElement(selector);
                el.innerHTML = value || '';
                break;
            }
            case 'setAttr': {
                const el = this.getElement(selector);
                if (!name) throw new Error('setAttr requires name parameter');
                el.setAttribute(name, value || '');
                break;
            }
            case 'remove': {
                const el = this.getElement(selector);
                el.remove();
                break;
            }
            case 'insertAdjacentHtml': {
                const el = this.getElement(selector);
                if (!position) throw new Error('insertAdjacentHtml requires position parameter');
                el.insertAdjacentHTML(position, value || '');
                break;
            }
            case 'addClass': {
                const el = this.getElement(selector);
                if (!value) throw new Error('addClass requires value parameter');
                el.classList.add(value);
                break;
            }
            case 'removeClass': {
                const el = this.getElement(selector);
                if (!value) throw new Error('removeClass requires value parameter');
                el.classList.remove(value);
                break;
            }
            case 'injectCss': {
                if (!value) throw new Error('injectCss requires value parameter');
                const style = document.createElement('style');
                style.textContent = value;
                document.head.appendChild(style);
                break;
            }
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    /**
     * 获取元素
     */
    private getElement(selector: string | undefined): Element {
        if (!selector) throw new Error('Missing selector parameter');
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        return el;
    }

    /**
     * 发送执行结果
     */
    private async sendResult(commandId: string, result: CommandResult): Promise<void> {
        const url = '/api/ui-commands/result';
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                commandId,
                ok: result.ok,
                result: result.result,
                error: result.error
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            throw new Error(`Failed to send result: HTTP ${response.status}`);
        }
    }

    /**
     * 序列化执行结果
     * 处理循环引用和不可序列化的值
     */
    private serializeResult(value: any): any {
        if (value === undefined) return null;
        if (value === null) return null;
        
        const type = typeof value;
        
        if (type === 'string' || type === 'number' || type === 'boolean') {
            return value;
        }
        
        if (value instanceof Date) {
            return value.toISOString();
        }
        
        if (value instanceof Element) {
            return {
                __type: 'Element',
                tagName: value.tagName,
                id: value.id,
                className: value.className
            };
        }
        
        if (Array.isArray(value)) {
            return value.map(item => this.serializeResult(item));
        }
        
        if (type === 'object') {
            const result: Record<string, any> = {};
            for (const key of Object.keys(value)) {
                try {
                    result[key] = this.serializeResult(value[key]);
                } catch {
                    result[key] = '[unserializable]';
                }
            }
            return result;
        }
        
        return String(value);
    }

    /**
     * 休眠指定时间
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 导出单例
export const uiCommandService = new UiCommandService();
