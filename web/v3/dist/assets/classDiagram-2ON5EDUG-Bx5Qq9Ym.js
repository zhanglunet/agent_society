import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-2MO3GhMI.js";
import { _ as __name } from "./mermaid.core-BlBv28UA.js";
import "./chunk-FMBD7UC4-ByzUGs87.js";
import "./chunk-55IACEB6-5i84yA5p.js";
import "./chunk-QN33PNHL-CpE7OGTZ.js";
import "./index-DSxWpeqP.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-Bx5Qq9Ym.js.map
