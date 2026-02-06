import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-CwrTKk_t.js";
import { _ as __name } from "./mermaid.core-BZ_t1ElR.js";
import "./chunk-55IACEB6-DQ0_c91X.js";
import "./chunk-QN33PNHL-BhLe9sNi.js";
import "./index-5z8pGDl4.js";
var diagram = {
  parser: stateDiagram_default,
  get db() {
    return new StateDB(2);
  },
  renderer: stateRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.state) {
      cnf.state = {};
    }
    cnf.state.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-xFgzMlO7.js.map
