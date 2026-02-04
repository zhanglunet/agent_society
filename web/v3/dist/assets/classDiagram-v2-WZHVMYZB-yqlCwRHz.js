import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-DSsLKOOb.js";
import { _ as __name } from "./mermaid.core-eMvI4Tbm.js";
import "./chunk-FMBD7UC4-CpbgET6s.js";
import "./chunk-55IACEB6-BGhsGao_.js";
import "./chunk-QN33PNHL-6MPF_pmL.js";
import "./index-Bedyk1PU.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-yqlCwRHz.js.map
