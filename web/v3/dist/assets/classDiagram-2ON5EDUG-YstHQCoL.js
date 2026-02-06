import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Cv6QPTCQ.js";
import { _ as __name } from "./mermaid.core-Cy5BLPzm.js";
import "./chunk-FMBD7UC4-BwBG9On7.js";
import "./chunk-55IACEB6-BNu4hTpi.js";
import "./chunk-QN33PNHL-Br74IeKw.js";
import "./index-CebQFIyI.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-YstHQCoL.js.map
