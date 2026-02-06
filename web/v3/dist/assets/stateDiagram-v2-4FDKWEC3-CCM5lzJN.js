import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-C8Oa2AcC.js";
import { _ as __name } from "./mermaid.core-Bm17AL0L.js";
import "./chunk-55IACEB6-VQCoe0kG.js";
import "./chunk-QN33PNHL-B79f7AWi.js";
import "./index-WO3trOIw.js";
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
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-CCM5lzJN.js.map
