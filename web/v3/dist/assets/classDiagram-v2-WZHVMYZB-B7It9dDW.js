import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-C5qC593A.js";
import { _ as __name } from "./mermaid.core-DAZpFbiE.js";
import "./chunk-FMBD7UC4-B0mqADtL.js";
import "./chunk-55IACEB6-BQbGyV3O.js";
import "./chunk-QN33PNHL-CGO6rRHK.js";
import "./index-DW5NCC0q.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-B7It9dDW.js.map
