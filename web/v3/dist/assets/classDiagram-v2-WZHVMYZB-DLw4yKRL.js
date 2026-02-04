import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-CT8LBha5.js";
import { _ as __name } from "./mermaid.core-DBrx_CMw.js";
import "./chunk-FMBD7UC4-98e4AoQT.js";
import "./chunk-55IACEB6-DYf0PnbV.js";
import "./chunk-QN33PNHL-BP_iiKc7.js";
import "./index-C-IaHvqm.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-DLw4yKRL.js.map
