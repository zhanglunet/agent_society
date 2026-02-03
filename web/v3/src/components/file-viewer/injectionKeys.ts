/**
 * 文件查看器相关的注入键
 */

/**
 * 代码复制功能的注入键
 * 用于 CodeRenderer 向 FileViewerHeader 提供复制函数
 */
export const CopyFunctionKey = Symbol('copyFunction');
