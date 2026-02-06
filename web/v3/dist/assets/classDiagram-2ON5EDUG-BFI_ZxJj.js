import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-CmSRBQr5.js";
import { _ as __name } from "./mermaid.core-BwD1UGtW.js";
import "./chunk-FMBD7UC4-Bo3rrTtz.js";
import "./chunk-55IACEB6-DMc0edB1.js";
import "./chunk-QN33PNHL-BWY1paNR.js";
import "./index-DNAsu1Id.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-BFI_ZxJj.js.map
