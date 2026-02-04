import { s as styles_default, b as stateRenderer_v3_unified_default, a as stateDiagram_default, S as StateDB } from "./chunk-DI55MBZ5-DoLR6DnF.js";
import { _ as __name } from "./mermaid.core-Dr_7ictC.js";
import "./chunk-55IACEB6-3Ga2F_wM.js";
import "./chunk-QN33PNHL-rKoH08rF.js";
import "./index-DJescE9z.js";
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
//# sourceMappingURL=stateDiagram-v2-4FDKWEC3-DXcuQ7nL.js.map
