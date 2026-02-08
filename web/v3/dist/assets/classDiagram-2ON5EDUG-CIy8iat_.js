import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-C3X-njmc.js";
import { _ as __name } from "./mermaid.core-B5VKa_uA.js";
import "./chunk-FMBD7UC4-Bi32MmgC.js";
import "./chunk-55IACEB6-C8bhU80_.js";
import "./chunk-QN33PNHL-BiMeQl7p.js";
import "./index-Fq__8seO.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-CIy8iat_.js.map
