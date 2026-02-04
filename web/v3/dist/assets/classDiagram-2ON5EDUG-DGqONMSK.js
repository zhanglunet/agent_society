import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-5SE1x-xu.js";
import { _ as __name } from "./mermaid.core-D0rxBZpT.js";
import "./chunk-FMBD7UC4-D_QYSfIo.js";
import "./chunk-55IACEB6-C9Zz6X70.js";
import "./chunk-QN33PNHL-DgNnabSA.js";
import "./index-T5kn7Fav.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-DGqONMSK.js.map
