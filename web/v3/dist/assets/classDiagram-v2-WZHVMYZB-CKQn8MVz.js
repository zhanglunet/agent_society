import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Ck-P32Gb.js";
import { _ as __name } from "./mermaid.core-Bm17AL0L.js";
import "./chunk-FMBD7UC4-0QE26CHc.js";
import "./chunk-55IACEB6-VQCoe0kG.js";
import "./chunk-QN33PNHL-B79f7AWi.js";
import "./index-WO3trOIw.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-CKQn8MVz.js.map
