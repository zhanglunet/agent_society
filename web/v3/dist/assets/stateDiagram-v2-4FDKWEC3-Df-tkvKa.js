import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-CfabHAkK.js";
import { _ as __name } from "./mermaid.core-vCiD3rh4.js";
import "./chunk-55IACEB6-CkhmUPqH.js";
import "./chunk-QN33PNHL-iC8WlmFc.js";
import "./index-B69KCLiK.js";
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
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-Df-tkvKa.js.map
