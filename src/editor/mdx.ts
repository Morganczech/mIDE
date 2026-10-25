import type { Text } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import {
  Registry,
  type StateStack,
  type IToken,
} from "@shikijs/vscode-textmate";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import mdx from "@shikijs/langs/mdx";
import tsx from "@shikijs/langs/tsx";
import yaml from "@shikijs/langs/yaml";
import toml from "@shikijs/langs/toml";
import javascript from "@shikijs/langs/javascript";
import typescript from "@shikijs/langs/typescript";
import html from "@shikijs/langs/html";
import css from "@shikijs/langs/css";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";

// Reuse the MDX TextMate grammar, without rendering/compiling MDX or installing
// editor helpers. Only our supported web languages are loaded for code fences.
const grammars = [
  ...mdx,
  ...tsx,
  ...yaml,
  ...toml,
  ...javascript,
  ...typescript,
  ...html,
  ...css,
  ...json,
  ...markdown,
];
const engine = createJavaScriptRegexEngine({ target: "ES2018" });
const registry = new Registry({
  onigLib: {
    createOnigScanner: (patterns) => engine.createScanner(patterns),
    createOnigString: (text) => engine.createString(text),
  },
  loadGrammar: (scope) =>
    grammars.find((grammar) => grammar.scopeName === scope),
});
const grammar = registry.loadGrammar("source.mdx")!;

// Map TextMate scopes onto the existing theme's Lezer tags, never fixed colors.
export function mdxTokenStyle(scopes: readonly string[]): string | null {
  const format = [
    scopes.some((scope) =>
      /(?:markup\.heading|entity\.name\.section)/.test(scope),
    )
      ? "heading"
      : "",
    scopes.some((scope) => /(?:markup\.bold|\.strong(?:\.|$))/.test(scope))
      ? "strong"
      : "",
    scopes.some((scope) => /(?:markup\.italic|\.emphasis(?:\.|$))/.test(scope))
      ? "emphasis"
      : "",
  ].filter(Boolean);
  let color = "";
  for (const scope of [...scopes].reverse()) {
    if (scope.startsWith("markup.inline.raw")) {
      color = "string";
      break;
    }
    if (scope.startsWith("comment")) {
      color = "comment";
      break;
    }
    if (/^(?:entity\.name\.(?:tag|type|class)|support\.class)/.test(scope)) {
      color = "typeName";
      break;
    }
    if (
      /^(?:entity\.other\.attribute-name|entity\.name\.function|support\.function|support\.type\.property-name|variable\.other\.property|variable\.function)/.test(
        scope,
      )
    ) {
      color = "propertyName";
      break;
    }
    if (/^constant\.(?:numeric|language)/.test(scope)) {
      color = "number";
      break;
    }
    if (
      /^(?:keyword|storage)\./.test(scope) &&
      !scope.startsWith("keyword.operator")
    ) {
      color = "keyword";
      break;
    }
    if (
      scope.startsWith("string") &&
      !/\.other\.(?:begin|end|strong|emphasis)/.test(scope)
    ) {
      color = "string";
      break;
    }
  }
  return [...format, color].filter(Boolean).join(" ") || null;
}
interface MDXState {
  stack: StateStack | null;
  tokens: IToken[];
  index: number;
}
export const mdxLanguage = StreamLanguage.define<MDXState>({
  name: "MDX",
  startState: () => ({ stack: null, tokens: [], index: 0 }),
  copyState: (state) => ({ ...state }),
  blankLine(state) {
    state.stack = grammar.tokenizeLine("", state.stack).ruleStack;
  },
  token(stream, state) {
    if (stream.sol()) {
      const result = grammar.tokenizeLine(stream.string, state.stack);
      state.stack = result.ruleStack;
      state.tokens = result.tokens;
      state.index = 0;
    }
    while (
      state.index < state.tokens.length &&
      state.tokens[state.index].endIndex <= stream.pos
    )
      state.index++;
    const token = state.tokens[state.index];
    if (!token) {
      stream.skipToEnd();
      return null;
    }
    stream.pos = Math.min(
      stream.string.length,
      Math.max(stream.pos + 1, token.endIndex),
    );
    return mdxTokenStyle(token.scopes);
  },
});

// Preserve TextMate's context so code fences, inline code and comments never
// become image references merely because they contain HTML-looking text.
interface MarkupCache {
  line: number;
  stack: StateStack | null;
  start: number | null;
  ranges: { from: number; to: number }[];
}
const markupCache = new WeakMap<Text, MarkupCache>();
export function mdxMarkupRanges(
  doc: Text,
  to: number,
): { from: number; to: number }[] {
  let cache = markupCache.get(doc);
  if (!cache) {
    cache = { line: 1, stack: null, start: null, ranges: [] };
    markupCache.set(doc, cache);
  }
  const lastLine = doc.lineAt(to).number;
  while (
    cache.line <= doc.lines &&
    (cache.line <= lastLine || cache.start !== null)
  ) {
    const line = doc.line(cache.line++);
    const result = grammar.tokenizeLine(line.text, cache.stack);
    cache.stack = result.ruleStack;
    for (const token of result.tokens) {
      if (
        token.scopes.some((scope) =>
          /comment|markup\.(?:code|raw|inline)/.test(scope),
        )
      )
        continue;
      if (
        !token.scopes.some(
          (scope) => scope === "punctuation.definition.tag.end.jsx",
        )
      )
        continue;
      const value = line.text.slice(token.startIndex, token.endIndex);
      if (value === "<") cache.start = line.from + token.startIndex;
      if (value === ">" && cache.start !== null) {
        cache.ranges.push({
          from: cache.start,
          to: line.from + token.endIndex,
        });
        cache.start = null;
      }
    }
  }
  return cache.ranges;
}
