import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Cwwe_33o.js";
import { _ as __name } from "./mermaid.core-CU43e0h4.js";
import "./chunk-FMBD7UC4-0dnCxVPa.js";
import "./chunk-55IACEB6-Dr_tmIfA.js";
import "./chunk-QN33PNHL-B4uaRPy4.js";
import "./index-0ZXhTfTA.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-BNZOtNIw.js.map
