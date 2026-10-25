import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../src/lib/backend";
import { clearImages, loadImage } from "../src/lib/images";
const payload = { bytes: [1, 2], size: 2, mime: "image/png" };
beforeEach(() => {
  clearImages();
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 80;
      naturalHeight = 60;
      decode = () => Promise.resolve();
    },
  );
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/png;base64,AQI=";
      onload?: () => void;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearImages();
});
describe("shared image loading", () => {
  it("shares loads across tabs, hover previews and gutter markers", async () => {
    const read = vi.spyOn(backend, "image").mockResolvedValue(payload);
    const first = loadImage("a.png"),
      second = loadImage("a.png");
    expect(first).toBe(second);
    expect(await first).toMatchObject({
      path: "a.png",
      width: 80,
      height: 60,
      size: 2,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("limits concurrent filesystem requests", async () => {
    const resolve: (() => void)[] = [];
    const read = vi
      .spyOn(backend, "image")
      .mockImplementation(
        () => new Promise((done) => resolve.push(() => done(payload))),
      );
    const loads = Array.from({ length: 6 }, (_, i) => loadImage(`${i}.png`));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    resolve.splice(0).forEach((done) => done());
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(6));
    resolve.splice(0).forEach((done) => done());
    await Promise.all(loads);
  });
  it("rejects stale results after refresh or a project switch", async () => {
    let finish!: (value: typeof payload) => void;
    vi.spyOn(backend, "image").mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const pending = loadImage("a.png");
    const rejected = expect(pending).rejects.toThrow("Image changed");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    clearImages();
    finish(payload);
    await rejected;
  });
  it("does not retain failed reads, so a corrected file can be retried", async () => {
    const read = vi
      .spyOn(backend, "image")
      .mockRejectedValueOnce(new Error("Missing image"))
      .mockResolvedValue(payload);
    await expect(loadImage("a.png")).rejects.toThrow("Missing image");
    await expect(loadImage("a.png")).resolves.toMatchObject({ path: "a.png" });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("evicts old image entries", async () => {
    const read = vi.spyOn(backend, "image").mockResolvedValue(payload);
    for (let i = 0; i < 25; i++) await loadImage(`${i}.png`);
    await loadImage("0.png");
    expect(read).toHaveBeenCalledTimes(26);
  });
  it("evicts decoded images when the byte budget is exceeded", async () => {
    const read = vi
      .spyOn(backend, "image")
      .mockResolvedValue({ ...payload, size: 16 * 1024 * 1024 });
    await loadImage("a.png");
    await loadImage("b.png");
    await loadImage("c.png");
    await loadImage("a.png");
    expect(read).toHaveBeenCalledTimes(4);
  });
  it("rejects corrupt image data and allows a later corrected version", async () => {
    vi.spyOn(backend, "image").mockResolvedValue(payload);
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = () => Promise.reject(new Error("Corrupt image"));
      },
    );
    await expect(loadImage("bad.png")).rejects.toThrow("Corrupt image");
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 16;
        naturalHeight = 16;
        decode = () => Promise.resolve();
      },
    );
    await expect(loadImage("bad.png")).resolves.toMatchObject({
      width: 16,
      height: 16,
    });
  });
});
