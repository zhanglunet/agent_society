import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-D3oCBZV2.js";
import { _ as __name } from "./mermaid.core-B_KRZU8-.js";
import "./chunk-FMBD7UC4-BG_Wk2cW.js";
import "./chunk-55IACEB6-Dk0Fx4is.js";
import "./chunk-QN33PNHL-BSYSHeYV.js";
import "./index-L_D1iRui.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-DJ3C3Fqm.js.map
