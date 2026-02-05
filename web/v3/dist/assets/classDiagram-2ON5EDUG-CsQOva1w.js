import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-BjpOyM2c.js";
import { _ as __name } from "./mermaid.core-BK7steoQ.js";
import "./chunk-FMBD7UC4-eEAwciqa.js";
import "./chunk-55IACEB6-DsXGXkXy.js";
import "./chunk-QN33PNHL-Bxs8Jy85.js";
import "./index-gACdjiv4.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-CsQOva1w.js.map
