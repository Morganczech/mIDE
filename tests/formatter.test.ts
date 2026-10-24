import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const script = resolve("src-tauri/resources/formatter/format.mjs");
function format(path: string, text: string) {
  return spawnSync(process.execPath, [script, path], {
    input: text,
    encoding: "utf8",
  });
}
describe("explicit formatter", () => {
  it.each([
    ["a.html", "<main><h1>Hello</h1></main>"],
    ["a.css", "main{color:red}"],
    ["a.js", "const a=1"],
    ["a.ts", "const a:number=1"],
    ["a.jsx", "const a=<h1>Hello</h1>"],
    ["a.tsx", "const a:Node=<h1>Hello</h1>"],
    ["a.json", '{"a":1}'],
    ["a.md", "# Hello\n\nWorld"],
    ["a.astro", '---\nconst title="Hello"\n---\n<main><h1>{title}</h1></main>'],
  ])("formats %s and is idempotent", (path, text) => {
    const output = format(path, text);
    expect(output.error).toBeUndefined();
    expect(output.stdout.length).toBeGreaterThan(0);
    expect(output.stderr).toBe("");
    expect(output.status).toBe(0);
    expect(format(path, output.stdout).stdout).toBe(output.stdout);
  });
  it("preserves CRLF and reports invalid input", () => {
    const crlf = format("a.ts", "const a=1\r\n");
    expect(crlf.error).toBeUndefined();
    expect(crlf.status, crlf.stderr).toBe(0);
    expect(crlf.stdout).toBe("const a = 1;\r\n");
    expect(format("a.ts", "const =").status).not.toBe(0);
    expect(format("a.rs", "fn main() {}").status).not.toBe(0);
  });
});
