var _a;
import { _ as __name } from "./mermaid.core-D-cUnbIe.js";
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
//# sourceMappingURL=chunk-QZHKN3VN-B9qpIA8l.js.map
