import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-fnwBv_mS.js";
import { _ as __name } from "./mermaid.core-B7PxL_kK.js";
import "./chunk-FMBD7UC4-gSdbsm4C.js";
import "./chunk-55IACEB6-M5BocjAV.js";
import "./chunk-QN33PNHL-B-cRsdJu.js";
import "./index-DdDyB3ks.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-DB_aC57x.js.map
