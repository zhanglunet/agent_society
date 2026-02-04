import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Bc2rfcZX.js";
import { _ as __name } from "./mermaid.core-C4ZJyyJ3.js";
import "./chunk-FMBD7UC4-CV95Quic.js";
import "./chunk-55IACEB6-CNv2iWaz.js";
import "./chunk-QN33PNHL-gNOKCG1C.js";
import "./index-BH6yO5MW.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-BmsCduRx.js.map
