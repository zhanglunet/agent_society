import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Bj11R9-d.js";
import { _ as __name } from "./mermaid.core-CWWU3e_q.js";
import "./chunk-FMBD7UC4-CxGN6Hfu.js";
import "./chunk-55IACEB6-DfTiHYgj.js";
import "./chunk-QN33PNHL-Dw8iYFJ1.js";
import "./index-CmqlfmTC.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-CKJkcq1S.js.map
