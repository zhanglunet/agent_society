import { _ as __name } from "./mermaid.core-BXEAvewN.js";
function populateCommonDb(ast, db) {
  if (ast.accDescr) {
    db.setAccDescription?.(ast.accDescr);
  }
  if (ast.accTitle) {
    db.setAccTitle?.(ast.accTitle);
  }
  if (ast.title) {
    db.setDiagramTitle?.(ast.title);
  }
}
__name(populateCommonDb, "populateCommonDb");
export {
  populateCommonDb as p
};
//# sourceMappingURL=chunk-4BX2VUAB-DLOT1snp.js.map
