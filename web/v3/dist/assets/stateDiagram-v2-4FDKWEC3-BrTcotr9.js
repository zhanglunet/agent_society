import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-C0zEi_xz.js";
import { _ as __name } from "./mermaid.core-DAZpFbiE.js";
import "./chunk-55IACEB6-BQbGyV3O.js";
import "./chunk-QN33PNHL-CGO6rRHK.js";
import "./index-DW5NCC0q.js";
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
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-BrTcotr9.js.map
