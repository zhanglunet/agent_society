import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-B4BG7PRW-D4G84xre.js";
import { _ as __name } from "./mermaid.core-D0i9iQ5U.js";
import "./chunk-FMBD7UC4-BIYRn4VK.js";
import "./chunk-55IACEB6-A2w10cjD.js";
import "./chunk-QN33PNHL-yCaAPNzJ.js";
import "./index-BVgmCNfk.js";
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
//# sourceMappingURL=classDiagram-2ON5EDUG-j1X3Hlw7.js.map
