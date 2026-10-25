import { beforeAll, describe, expect, it } from "vitest";
import { ensureSyntaxTree } from "@codemirror/language";
import { createEditorState } from "../src/editor/config";
import { codeReferences } from "../src/editor/image-references";
import { prepareLanguage } from "../src/editor/languages";
import { resolveImagePath } from "../src/lib/images";
import { mdnElementUrl } from "../src/editor/html-docs";
beforeAll(() => prepareLanguage("page.mdx"));
function references(text: string, path = "pages/index.html") {
  const { state } = createEditorState(text, path, "LF");
  ensureSyntaxTree(state, state.doc.length, 5000);
  return codeReferences(state, path);
}
describe("image paths", () => {
  it("resolves document-relative, root-relative, encoded and query-bearing paths", () => {
    expect(
      resolveImagePath("pages/index.html", "../images/my%20image.png?v=2#x"),
    ).toBe("images/my image.png");
    expect(resolveImagePath("pages/index.html", "/favicon.ico")).toBe(
      "favicon.ico",
    );
    expect(resolveImagePath("pages/index.html", "./x.svg")).toBe("pages/x.svg");
  });
  it.each([
    "../../escape.png",
    "https://example.com/x.png",
    "//example.com/x.png",
    "data:image/png,x",
    "@/x.png",
    "~/x.png",
    "file:///tmp/x.png",
    "a\\x.png",
    "%00.png",
    "%E0%A4.png",
  ])("rejects unsupported or escaping path %s", (source) => {
    expect(resolveImagePath("pages/index.html", source)).toBeNull();
  });
});
describe("syntax-aware image and HTML references", () => {
  it.each(["html", "astro", "jsx", "tsx", "mdx"])(
    "finds static images and standard tags in %s",
    (extension) => {
      const refs = references(
        '<footer><img src="../a.png" /><img src="/b.ico" /></footer>',
        `pages/index.${extension}`,
      );
      expect(
        refs.filter((ref) => ref.type === "image").map((ref) => ref.path),
      ).toEqual(["a.png", "b.ico"]);
      expect(
        refs.filter((ref) => ref.type === "tag").map((ref) => ref.value),
      ).toEqual(["footer", "img", "img", "footer"]);
    },
  );
  it("ignores comments, source-code strings and dynamic JSX", () => {
    const refs = references(
      'const text = \'<img src="x.png">\'; // <img src="y.png">\nconst a = <Card src="z.png"><img src={path}/><img src="a.png"/></Card>;',
      "a.tsx",
    );
    expect(
      refs.filter((ref) => ref.type === "image").map((ref) => ref.path),
    ).toEqual(["a.png"]);
    expect(refs.some((ref) => ref.value === "Card")).toBe(false);
  });
  it("ignores HTML comments, scripts and plain text", () => {
    const refs = references(
      '<!-- <img src="no.png"> --><script>const x = \'<img src="no.png">\';</script><p>footer</p>',
    );
    expect(refs.filter((ref) => ref.type === "image")).toEqual([]);
    expect(refs.filter((ref) => ref.value === "footer")).toEqual([]);
  });
  it("finds favicons and multiline attributes", () => {
    const refs = references(
      '<link rel="icon" href="/favicon.ico">\n<img\n src="a.png"\n>',
    );
    expect(
      refs.filter((ref) => ref.type === "image").map((ref) => ref.path),
    ).toEqual(["favicon.ico", "pages/a.png"]);
  });
  it("excludes MDX inline code, fences and expressions", () => {
    const text =
      '`<img src="inline.png" />`\n\n```html\n<img src="fenced.png" />\n```\n\n{/* <img src="comment.png" /> */}\n\n<img\n src="real.png"\n/>\n';
    expect(
      references(text, "page.mdx")
        .filter((ref) => ref.type === "image")
        .map((ref) => ref.path),
    ).toEqual(["real.png"]);
  });
  it("uses the heading reference for every heading level", () => {
    expect(mdnElementUrl("h2")).toContain("Heading_Elements");
    expect(mdnElementUrl("footer")).toMatch(/\/footer$/);
  });
  it("changes references when a path is edited", () => {
    const { state } = createEditorState('<img src="a.png">', "page.html", "LF");
    const next = state.update({
      changes: { from: 10, to: 15, insert: "missing.png" },
    }).state;
    expect(
      codeReferences(next, "page.html")
        .filter((ref) => ref.type === "image")
        .map((ref) => ref.path),
    ).toEqual(["missing.png"]);
  });
});
