import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-erT_FIh6.js";
import { _ as __name } from "./mermaid.core-D0rxBZpT.js";
import "./chunk-55IACEB6-C9Zz6X70.js";
import "./chunk-QN33PNHL-DgNnabSA.js";
import "./index-T5kn7Fav.js";
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
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-DlYdqOAI.js.map
