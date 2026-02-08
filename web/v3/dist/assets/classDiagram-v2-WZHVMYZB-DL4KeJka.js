import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-C62u3SQR.js";
import { _ as __name } from "./mermaid.core-Ceygtgch.js";
import "./chunk-FMBD7UC4-C4nX0P5w.js";
import "./chunk-55IACEB6-Cl1mjhxI.js";
import "./chunk-QN33PNHL-DpWhzYN4.js";
import "./index-BLVFmyrm.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-DL4KeJka.js.map
