import { describe, expect, it } from "vitest";
import { ensureSyntaxTree } from "@codemirror/language";
import { createEditorState } from "../src/editor/config";
import { cssReferences } from "../src/editor/css-references";
import { cssDocumentation, mdnCssUrl } from "../src/editor/css-docs";
import {
  findTroubleshootingGuides,
  troubleshootingGuides,
} from "../src/lib/troubleshooting";
function references(text: string, path = "styles.css") {
  const { state } = createEditorState(text, path, "LF");
  ensureSyntaxTree(state, state.doc.length, 5000);
  return cssReferences(state, path);
}
describe("CSS documentation", () => {
  it("recognizes properties without mistaking selectors, comments or values for declarations", () => {
    const refs = references(
      '/* padding: 1px */ .margin { display: flex; color: red; --gap: 2px; gap: var(--gap); font-family: "margin"; }',
    );
    expect(refs.map((ref) => ref.value)).toEqual([
      "display",
      "color",
      "gap",
      "font-family",
    ]);
  });
  it.each(["html", "astro"])(
    "finds CSS in %s style blocks and static inline styles",
    (extension) => {
      const text =
        '<style>.card { margin: 1rem; }</style><div style="display: flex; padding: 2px"></div>';
      const refs = references(text, `page.${extension}`);
      expect(refs.map((ref) => ref.value)).toEqual([
        "margin",
        "display",
        "padding",
      ]);
      for (const ref of refs)
        expect(text.slice(ref.from, ref.to)).toBe(ref.value);
    },
  );
  it("does not document JavaScript object keys, strings or commented HTML", () => {
    expect(
      references('const x = { display: "flex", margin: 1 };', "app.js"),
    ).toEqual([]);
    expect(
      references('const x = <div style={{ display: "flex" }} />;', "app.tsx"),
    ).toEqual([]);
    expect(
      references(
        "<!-- <div style=\"display: flex\"> --><script>const x = 'margin: 1px';</script>",
        "page.html",
      ),
    ).toEqual([]);
  });
  it("handles nested rules, media queries, uppercase properties and custom properties", () => {
    expect(
      references(
        "@media (width > 10px) { .x { DISPLAY: grid; --color: red; padding-inline: 1rem; } }",
      ).map((ref) => ref.value),
    ).toEqual(["display", "padding-inline"]);
  });
  it("preserves source offsets for a hovered line of multiline inline CSS", () => {
    const text = '<div style="\n  display: flex;\n  margin: 1rem;\n"></div>';
    const { state } = createEditorState(text, "page.html", "LF");
    ensureSyntaxTree(state, state.doc.length, 5000);
    const pos = text.indexOf("margin");
    const refs = cssReferences(state, "page.html", pos, pos + 6);
    expect(refs).toEqual([
      { from: pos, to: pos + 6, type: "css", value: "margin" },
    ]);
  });
  it("ships useful offline examples and direct MDN property links", () => {
    expect(Object.keys(cssDocumentation).length).toBeGreaterThan(100);
    for (const [name, doc] of Object.entries(cssDocumentation)) {
      expect(doc.description.length).toBeGreaterThan(15);
      expect(doc.example).toContain(`${name}:`);
      expect(mdnCssUrl(name)).toBe(
        `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/${name}`,
      );
    }
  });
});
describe("offline troubleshooting guides", () => {
  it("provides unique step-by-step guides with safe documentation links", () => {
    expect(new Set(troubleshootingGuides.map((guide) => guide.id)).size).toBe(
      troubleshootingGuides.length,
    );
    for (const guide of troubleshootingGuides) {
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
      expect(new URL(guide.url).hostname).toBe("developer.mozilla.org");
      expect(new URL(guide.url).protocol).toBe("https:");
    }
  });
  it("searches symptoms, tags, steps and examples with all query terms", () => {
    expect(
      findTroubleshootingGuides("button console").map((guide) => guide.id),
    ).toEqual(["button-not-working"]);
    expect(
      findTroubleshootingGuides("IMAGE PATHS").map((guide) => guide.id),
    ).toEqual(["image-missing"]);
    expect(findTroubleshootingGuides("box-sizing")).toEqual([]);
    expect(
      findTroubleshootingGuides("border-box").map((guide) => guide.id),
    ).toEqual(["small-screen"]);
    expect(findTroubleshootingGuides("nonexistent-symptom")).toEqual([]);
    expect(findTroubleshootingGuides("")).toHaveLength(5);
  });
});
