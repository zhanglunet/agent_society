Prism.languages.brainfuck = {
  "pointer": {
    pattern: /<|>/,
    alias: "keyword"
  },
  "increment": {
    pattern: /\+/,
    alias: "inserted"
  },
  "decrement": {
    pattern: /-/,
    alias: "deleted"
  },
  "branching": {
    pattern: /\[|\]/,
    alias: "important"
  },
  "operator": /[.,]/,
  "comment": /\S+/
};
//# sourceMappingURL=prism-brainfuck-5ZqvqfAw.js.map
