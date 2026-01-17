/**
 * 兼容性导出：http_server.js 已移动到 services/http/http_server.js
 * 此文件提供向后兼容的导出，将在未来版本中移除
 * @deprecated 请使用 services/http/http_server.js
 */
export { HTTPServer } from "./services/http/http_server.js";
// 向后兼容：提供 HttpServer 别名
export { HTTPServer as HttpServer } from "./services/http/http_server.js";
