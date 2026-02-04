import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-C6aNBoB2.js";
import { _ as __name } from "./mermaid.core-CxtPz0yt.js";
import "./chunk-FMBD7UC4-BKkri7Ww.js";
import "./chunk-55IACEB6-BRDFenXT.js";
import "./chunk-QN33PNHL-BdZZEqvF.js";
import "./index-BfgyqW74.js";
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
//# sourceMappingURL=classDiagram-v2-WZHVMYZB-t5guhppO.js.map
