var _a;
import { _ as __name } from "./mermaid.core-Clu0Z0yL.js";
var ImperativeState = (_a = class {
  /**
   * @param init - Function that creates the default state.
   */
  constructor(init) {
    this.init = init;
    this.records = this.init();
  }
  reset() {
    this.records = this.init();
  }
}, __name(_a, "ImperativeState"), _a);
export {
  ImperativeState as I
};
//# sourceMappingURL=chunk-QZHKN3VN-CgWkMJFv.js.map
