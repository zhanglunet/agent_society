Prism.languages.gcode = { comment: /;.*|\B\(.*?\)\B/, string: { pattern: /"(?:""|[^"])*"/, greedy: true }, keyword: /\b[GM]\d+(?:\.\d+)?\b/, property: /\b[A-Z]/, checksum: { pattern: /(\*)\d+/, lookbehind: true, alias: "number" }, punctuation: /[:*]/ };
//# sourceMappingURL=prism-gcode.min-CoPT5HuQ.js.map
