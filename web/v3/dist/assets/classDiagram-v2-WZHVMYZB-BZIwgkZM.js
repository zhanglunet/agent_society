import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-DR38qo9V.js";
import { _ as __name } from "./mermaid.core-vCiD3rh4.js";
import "./chunk-FMBD7UC4-BhQqmvHE.js";
import "./chunk-55IACEB6-CkhmUPqH.js";
import "./chunk-QN33PNHL-iC8WlmFc.js";
import "./index-B69KCLiK.js";
var diagram = {
  parser: classDiagram_default,
  get db() {
    return new ClassDB();
  },
  renderer: classRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.class) {
      cnf.class = {};
    }
    cnf.class.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-BZIwgkZM.js.map
