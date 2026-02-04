import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-siNIw9LS.js";
import { _ as __name } from "./mermaid.core-nTOYTSIl.js";
import "./chunk-FMBD7UC4-C0o0FDAp.js";
import "./chunk-55IACEB6-Br2F1OMO.js";
import "./chunk-QN33PNHL-DsowyotP.js";
import "./index-6eHxWZdm.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-WGmCWCn2.js.map
