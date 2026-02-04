import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-BRc4ShAL.js";
import { _ as __name } from "./mermaid.core-D-cUnbIe.js";
import "./chunk-FMBD7UC4-Djz8x4rG.js";
import "./chunk-55IACEB6-BTrW14nU.js";
import "./chunk-QN33PNHL-hiZdlhg4.js";
import "./index-D6hkV1RL.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-Bk8RclnX.js.map
