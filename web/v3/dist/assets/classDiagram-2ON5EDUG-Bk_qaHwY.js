import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-Dgp4LMOm.js";
import { _ as __name } from "./mermaid.core-Clu0Z0yL.js";
import "./chunk-FMBD7UC4-DAy93OQt.js";
import "./chunk-55IACEB6-Bxl_UFox.js";
import "./chunk-QN33PNHL-BXtzIrzK.js";
import "./index-DBPNx3nV.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-Bk_qaHwY.js.map
