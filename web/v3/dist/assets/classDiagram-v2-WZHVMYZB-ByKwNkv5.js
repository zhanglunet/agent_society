import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-DThRtVEY.js";
import { _ as __name } from "./mermaid.core-BZ_t1ElR.js";
import "./chunk-FMBD7UC4-C7soBIN6.js";
import "./chunk-55IACEB6-DQ0_c91X.js";
import "./chunk-QN33PNHL-BhLe9sNi.js";
import "./index-5z8pGDl4.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-ByKwNkv5.js.map
