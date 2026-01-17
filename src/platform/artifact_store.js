/**
 * 兼容性导出：artifact_store.js 已移动到 services/artifact/artifact_store.js
 * 
 * 此文件提供向后兼容的导出，以确保现有代码继续工作。
 * 建议更新导入路径为新位置：
 * 
 * 旧路径：import { ArtifactStore } from "./platform/artifact_store.js"
 * 新路径：import { ArtifactStore } from "./platform/services/artifact/artifact_store.js"
 * 
 * 此兼容性导出将在未来版本中移除。
 */

export { ArtifactStore } from "./services/artifact/artifact_store.js";
