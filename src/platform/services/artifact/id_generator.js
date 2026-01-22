import { randomBytes } from "node:crypto";

/**
 * 工件ID生成器：生成基于时间的UUID格式ID
 * 
 * 设计说明：
 * - ID格式：UUID v4格式（8-4-4-4-12），例如：550e8400-e29b-41d4-a716-446655440000
 * - 生成规则：基于时间戳+随机数，保证单调递增且全局唯一
 * - 时间部分：使用当前时间戳（毫秒）的十六进制表示
 * - 随机部分：使用加密安全的随机数填充剩余位
 * - 无需持久化：基于时间戳自然保证重启后ID不重复
 */
export class IdGenerator {
  /**
   * @param {{stateDir: string}} options - 配置选项（保留接口兼容性，实际不使用）
   */
  constructor(options) {
    // 保留参数以保持接口兼容，但不使用
    this._lastTimestamp = 0;
    this._sequence = 0;
  }

  /**
   * 初始化ID生成器（保留接口兼容性）
   * @returns {Promise<void>}
   */
  async init() {
    // 基于时间的生成器无需初始化
  }

  /**
   * 生成下一个ID
   * @returns {Promise<string>} 新的ID（UUID格式）
   */
  async next() {
    return this._generateTimeBasedUuid();
  }

  /**
   * 生成基于时间的UUID
   * @returns {string} UUID格式的ID
   * @private
   */
  _generateTimeBasedUuid() {
    // 获取当前时间戳（毫秒）
    let timestamp = Date.now();
    
    // 如果时间戳与上次相同，使用序列号避免冲突
    if (timestamp === this._lastTimestamp) {
      this._sequence++;
      // 序列号溢出时等待下一毫秒
      if (this._sequence > 0xfff) {
        while (Date.now() === timestamp) {
          // 忙等待
        }
        timestamp = Date.now();
        this._sequence = 0;
      }
    } else {
      this._lastTimestamp = timestamp;
      this._sequence = 0;
    }
    
    // 将时间戳转换为十六进制（13位十六进制，约52位）
    const timestampHex = timestamp.toString(16).padStart(12, '0');
    
    // 生成随机字节
    const randomBytesBuffer = randomBytes(10);
    const randomHex = randomBytesBuffer.toString('hex');
    
    // 组合序列号（12位，3个十六进制字符）
    const sequenceHex = this._sequence.toString(16).padStart(3, '0');
    
    // 构建UUID格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // 时间戳部分（前12位）+ 序列号（3位）+ 随机数（17位）
    const part1 = timestampHex.substring(0, 8);  // 8位
    const part2 = timestampHex.substring(8, 12); // 4位
    const part3 = '4' + sequenceHex;              // 4位（4表示UUID v4）
    const part4 = this._getVariantBits() + randomHex.substring(0, 3); // 4位
    const part5 = randomHex.substring(3, 15);    // 12位
    
    return `${part1}-${part2}-${part3}-${part4}-${part5}`;
  }

  /**
   * 获取UUID变体位（variant bits）
   * @returns {string} 变体位的十六进制字符
   * @private
   */
  _getVariantBits() {
    // UUID v4的变体位应该是10xx（二进制），对应十六进制8-b
    const variants = ['8', '9', 'a', 'b'];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  /**
   * 获取当前ID（返回新生成的ID）
   * @returns {Promise<string>} 新的ID
   */
  async current() {
    return this._generateTimeBasedUuid();
  }

  /**
   * 重置ID计数器（仅用于测试，基于时间的生成器此方法无实际作用）
   * @param {number} value - 重置的值（忽略）
   * @returns {Promise<void>}
   */
  async reset(value = 0) {
    // 基于时间的生成器无需重置
    this._sequence = 0;
  }
}
