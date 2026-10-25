const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MIDE_TEST_BROWSER,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1.5,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#77aadd"/><circle cx="40" cy="30" r="16" fill="#222"/></svg>';
    const files = {
      "index.html":
        '<footer>\n  <img src="image.svg"><img src="image.svg">\n  <img src="missing.png">\n</footer>',
      "image.svg": svg,
      "other.ts": "const x = 1;",
    };
    const folders = ["assets"];
    const callbacks = {};
    const listeners = {};
    let next = 0;
    window.__mock = { files, folders, listeners, callbacks, calls: [] };
    window.isTauri = true;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback(fn) {
        callbacks[++next] = fn;
        return next;
      },
      async invoke(command, args = {}) {
        window.__mock.calls.push({ command, args });
        if (command === "plugin:event|listen") {
          listeners[args.event] = args.handler;
          return ++next;
        }
        if (command.startsWith("plugin:")) return;
        if (command === "open_project" && args.path === "/tmp/missing-project")
          throw new Error("Project folder no longer exists");
        if (command === "open_project")
          return { name: "Preview project", path: "/tmp/preview-project" };
        if (command === "terminal_running") return false;
        if (command === "list_system_fonts") return [];
        if (command === "list_directory") {
          return [
            ...folders.map((path) => ({
              name: path.split("/").pop(),
              path,
              isDirectory: true,
              isSymlink: false,
            })),
            ...Object.keys(files).map((path) => ({
              name: path.split("/").pop(),
              path,
              isDirectory: false,
              isSymlink: false,
            })),
          ].filter(
            (entry) =>
              (entry.path.includes("/")
                ? entry.path.slice(0, entry.path.lastIndexOf("/"))
                : "") === args.path,
          );
        }
        if (command === "read_file") {
          if (!(args.path in files)) throw Error("File not found");
          return {
            text: files[args.path],
            revision: "1",
            bom: false,
            lineEnding: "LF",
          };
        }
        if (command === "read_image") {
          if (!(args.path in files)) throw Error("File not found");
          return {
            bytes: Array.from(new TextEncoder().encode(files[args.path])),
            mime: "image/svg+xml",
            size: files[args.path].length,
          };
        }
        if (command === "rename_entry") {
          if (args.destination in files) throw Error("Already exists");
          for (const path of Object.keys(files))
            if (path === args.path || path.startsWith(args.path + "/")) {
              files[args.destination + path.slice(args.path.length)] =
                files[path];
              delete files[path];
            }
          const i = folders.indexOf(args.path);
          if (i >= 0) folders[i] = args.destination;
          return;
        }
        if (command === "save_file") {
          files[args.path] = args.text;
          return "2";
        }
        if (command === "import_files")
          return {
            copied: ["assets/import.png"],
            failed: ["existing.png: already exists"],
          };
      },
    };
  });
  await page.goto(process.env.MIDE_TEST_URL || "http://127.0.0.1:1420");
  await page.getByRole("button", { name: "Open Folder" }).click();
  await page.getByRole("treeitem", { name: "index.html" }).click();
  await page.locator(".image-gutter-marker").waitFor();
  assert.equal(await page.locator(".image-gutter-marker").count(), 1);
  assert.equal(
    await page.locator(".image-gutter-marker span").textContent(),
    "+1",
  );
  const alignment = await page.evaluate(() => ({
    numbers: [...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
      .filter((e) => e.textContent.trim())
      .map((e) => e.getBoundingClientRect().top),
    lines: [...document.querySelectorAll(".cm-line")].map(
      (e) => e.getBoundingClientRect().top,
    ),
  }));
  // Ignore CodeMirror's hidden number spacer.
  assert(
    alignment.lines.every((top, i) =>
      alignment.numbers.some((n) => Math.abs(n - top) < 1),
    ),
    JSON.stringify(alignment),
  );
  await page.locator(".image-gutter-marker").hover();
  await page.locator(".image-hover-card").first().waitFor();
  assert.equal(await page.locator(".image-hover-card").count(), 2);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page
    .locator(".cm-content span")
    .filter({ hasText: /^footer$/ })
    .first()
    .hover();
  await page.getByRole("link", { name: "Read on MDN" }).waitFor();
  await page.getByRole("link", { name: "Read on MDN" }).click();
  assert(
    await page.evaluate(() =>
      window.__mock.calls.some(
        (call) =>
          call.command === "open_source_url" &&
          call.args.url.endsWith("/footer"),
      ),
    ),
  );
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page
    .locator(".cm-content span")
    .filter({ hasText: /^"image.svg"$/ })
    .first()
    .hover();
  await page.locator(".image-hover-card").waitFor();
  await page.screenshot({ path: "/tmp/mide-upgrade-hover.png" });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.getByRole("treeitem", { name: "image.svg" }).click();
  await page.locator(".image-canvas img").waitFor();
  assert.equal(await page.getByRole("tab").count(), 2);
  await page.getByRole("treeitem", { name: "image.svg" }).click();
  assert.equal(await page.getByRole("tab").count(), 2);
  await page
    .getByRole("treeitem", { name: "image.svg" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Copy Relative Path", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.__mock.calls.some(
      (call) =>
        call.command === "copy_entry_path" &&
        call.args.path === "image.svg" &&
        call.args.absolute === false,
    ),
  );
  await page
    .getByRole("treeitem", { name: "image.svg" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Copy Absolute Path", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.__mock.calls.some(
      (call) =>
        call.command === "copy_entry_path" && call.args.absolute === true,
    ),
  );
  await page.getByRole("button", { name: "Open Source", exact: true }).click();
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.getByRole("tab").count(), 3);
  await page.getByRole("tab", { name: "index.html", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("<!-- unsaved -->");
  await page
    .getByRole("treeitem", { name: "index.html" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  await page.getByRole("button", { name: "assets/", exact: true }).click();
  await page.getByRole("button", { name: "Move here" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[role=tab][aria-selected=true]")
        ?.getAttribute("title") === "assets/index.html",
  );
  assert(
    await page
      .locator(".cm-content")
      .textContent()
      .then((text) => text.includes("unsaved")),
  );
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Settings/ }).click();
  assert.equal(await page.getByRole("checkbox").count(), 3); // Three independent image/documentation preferences.
  await page
    .getByLabel("Image thumbnails in gutter", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Back to Editor" }).click();
  assert.equal(await page.locator(".cm-image-gutter").count(), 0);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Settings/ }).click();
  await page.getByLabel("Image thumbnails in gutter", { exact: true }).check();
  await page.getByRole("button", { name: "Back to Editor" }).click();
  // The moved HTML resolves relative to assets, so its former image references are now missing.
  assert.equal(await page.locator(".image-gutter-marker").count(), 0);
  // Pointer-based move preserves the active dirty HTML tab.
  const sourceRow = page.getByRole("treeitem", {
    name: "other.ts",
    exact: true,
  });
  const destinationRow = page.getByRole("treeitem", {
    name: "assets",
    exact: true,
  });
  const sourceBox = await sourceRow.boundingBox(),
    targetBox = await destinationRow.boundingBox();
  await page.mouse.move(sourceBox.x + 80, sourceBox.y + 12);
  await sourceRow.evaluate((row) =>
    row.addEventListener(
      "pointerdown",
      (event) => {
        row.dataset.testPointer = String(event.pointerId);
      },
      { once: true },
    ),
  );
  await page.mouse.down();
  assert(
    await sourceRow.evaluate((row) =>
      row.hasPointerCapture(Number(row.dataset.testPointer)),
    ),
    "Explorer must capture the pointer throughout a drag",
  );
  assert(
    await sourceRow.evaluate((row) => {
      const event = new Event("dragstart", { bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    "Browser-native dragging must be prevented",
  );
  await page.mouse.move(targetBox.x + 80, targetBox.y + 12, { steps: 8 });
  assert.equal(
    await page.locator(".explorer-drag-preview").textContent(),
    "other.ts",
  );
  assert(
    await sourceRow.evaluate((row) => row.classList.contains("drag-source")),
  );
  const previewBefore = await page
    .locator(".explorer-drag-preview")
    .evaluate((element) => element.style.transform);
  await page.mouse.move(targetBox.x + 105, targetBox.y + 12);
  assert.notEqual(
    await page
      .locator(".explorer-drag-preview")
      .evaluate((element) => element.style.transform),
    previewBefore,
  );
  await page.screenshot({ path: "/tmp/mide-drag-preview.png" });
  assert(
    await destinationRow.evaluate((row) =>
      row.classList.contains("drop-target"),
    ),
  );
  await page.mouse.up();
  assert.equal(await page.locator(".explorer-drag-preview").count(), 0);
  assert.equal(await page.locator(".drag-source").count(), 0);
  await page.waitForFunction(() =>
    window.__mock.calls.some(
      (call) =>
        call.command === "rename_entry" &&
        call.args.destination === "assets/other.ts",
    ),
  );
  assert(
    await page
      .locator(".cm-content")
      .textContent()
      .then((text) => text.includes("unsaved")),
  );
  // Native event simulation verifies physical-to-CSS coordinates at 150% scale.
  await page.evaluate(
    ({ x, y }) => {
      const id = window.__mock.listeners["tauri://drag-drop"];
      window.__mock.callbacks[id]({
        payload: {
          paths: ["/tmp/import.png", "/tmp/existing.png"],
          position: { x: x * devicePixelRatio, y: y * devicePixelRatio },
        },
      });
    },
    { x: targetBox.x + 80, y: targetBox.y + 12 },
  );
  await page.waitForFunction(() =>
    window.__mock.calls.some(
      (call) =>
        call.command === "import_files" && call.args.directory === "assets",
    ),
  );
  await page.getByRole("alert").filter({ hasText: "existing.png" }).waitFor();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.screenshot({ path: "/tmp/mide-upgrade-dark.png" });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Settings/ }).click();
  await page
    .locator(".theme-library")
    .getByRole("radio", { name: "Light", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to Editor" }).click();
  await page.screenshot({ path: "/tmp/mide-upgrade-light.png" });
  await page.setViewportSize({ width: 600, height: 400 });
  assert(await page.locator(".cm-content").isVisible());
  await page.screenshot({ path: "/tmp/mide-upgrade-small.png" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Recent projects", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/mide-recent-projects.png" });
  await page
    .getByRole("button", {
      name: "Preview project /tmp/preview-project",
      exact: true,
    })
    .click();
  await page.getByRole("treeitem", { name: "index.html" }).waitFor();
  assert(
    await page.evaluate(() =>
      window.__mock.calls.some(
        (call) =>
          call.command === "open_project" &&
          call.args.path === "/tmp/preview-project",
      ),
    ),
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "mide-recent-projects",
      JSON.stringify([
        { name: "Missing project", path: "/tmp/missing-project" },
        { name: "Preview project", path: "/tmp/preview-project" },
      ]),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Missing project /tmp/missing-project",
      exact: true,
    })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Project folder no longer exists" })
    .waitFor();
  assert(
    await page
      .getByRole("heading", { name: "Recent projects", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", {
      name: "Remove Missing project from recent projects",
      exact: true,
    })
    .click();
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Missing project /tmp/missing-project",
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", {
        name: "Preview project /tmp/preview-project",
        exact: true,
      })
      .count(),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser smoke: image tabs/source, gutter alignment/count, preferences, move with unsaved text, stale thumbnails; no runtime errors",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
