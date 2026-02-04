import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-BbMBoJI_.js";
import { _ as __name } from "./mermaid.core-CxtPz0yt.js";
import "./chunk-55IACEB6-BRDFenXT.js";
import "./chunk-QN33PNHL-BdZZEqvF.js";
import "./index-BfgyqW74.js";
var diagram = {
  parser: stateDiagram_default,
  get db() {
    return new StateDB(2);
  },
  renderer: stateRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.state) {
      cnf.state = {};
    }
    cnf.state.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-BISqn86c.js.map
