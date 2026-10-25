(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const results = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, name) => {
    for (let i = 0; i < 160; i++) {
      if (predicate()) return;
      await wait(50);
    }
    throw new Error(`Timed out: ${name}`);
  };
  const check = (value, name) => {
    if (!value) throw new Error(name);
    results.push(`PASS ${name}`);
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (element) =>
        element.textContent.trim() === text ||
        element.firstChild?.textContent.trim() === text,
    );
  const click = async (text) => {
    await until(() => button(text), text);
    button(text).click();
    await wait(80);
  };
  const refresh = async () => {
    document.querySelector('[aria-label="Project actions"]').click();
    await click("Refresh");
  };
  const write = async (path, text) => {
    await invoke("create_entry", { path, directory: false });
    const file = await invoke("read_file", { path });
    await invoke("save_file", {
      path,
      text,
      revision: file.revision,
      bom: false,
    });
  };
  try {
    await until(() => button("Open Folder"), "empty state");
    await click("Open Folder");
    await until(
      () => document.querySelector("[role=treeitem]"),
      "project tree",
    );
    await write(
      "upgrade-image.svg",
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#77aadd"/></svg>',
    );
    const html =
      '<footer>\n  <img src="upgrade-image.svg"><img src="upgrade-image.svg">\n  <img src="missing.png">\n</footer>';
    await write("upgrade-page.html", html);
    await invoke("create_entry", { path: "upgrade-assets", directory: true });
    await refresh();
    await click("upgrade-page.html");
    await until(
      () => document.querySelector(".image-gutter-marker"),
      "native SVG thumbnail",
    );
    check(
      document.querySelectorAll(".image-gutter-marker").length === 1,
      "missing image has no gutter marker",
    );
    check(
      document.querySelector(".image-gutter-marker span").textContent === "+1",
      "multiple images share a marker with a count",
    );
    const lines = [...document.querySelectorAll(".cm-line")].map(
      (line) => line.getBoundingClientRect().top,
    );
    const numbers = [
      ...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ].map((line) => line.getBoundingClientRect().top);
    check(
      lines.every((top) =>
        numbers.some((number) => Math.abs(number - top) < 1),
      ),
      "gutter does not change line alignment",
    );
    document.querySelector(".image-gutter-marker").click();
    await until(
      () => document.querySelectorAll(".image-hover-card").length === 2,
      "gutter image details",
    );
    check(
      document
        .querySelector(".image-hover-card")
        .textContent.includes("80 × 60"),
      "native image dimensions",
    );
    await click("upgrade-image.svg");
    await until(
      () => document.querySelector(".image-canvas img")?.naturalWidth === 80,
      "image tab",
    );
    const count = document.querySelectorAll("[role=tab]").length;
    await click("upgrade-image.svg");
    check(
      document.querySelectorAll("[role=tab]").length === count,
      "image tab deduplicated",
    );
    await click("Open Source");
    await until(
      () => window.__mideView?.state.doc.toString().startsWith("<svg"),
      "editable SVG source",
    );
    check(
      document.querySelectorAll("[role=tab]").length === count + 1,
      "SVG source and preview coexist",
    );
    const relative = await invoke("copy_entry_path", {
      path: "upgrade-image.svg",
      absolute: false,
    });
    const absolute = await invoke("copy_entry_path", {
      path: "upgrade-image.svg",
      absolute: true,
    });
    check(
      relative === "upgrade-image.svg" &&
        absolute.endsWith("/upgrade-image.svg"),
      "native relative and absolute clipboard writes",
    );
    await click("upgrade-page.html");
    window.__mideView.dispatch({
      changes: { from: html.length, insert: "<!-- unsaved -->" },
    });
    const row = [...document.querySelectorAll("[role=treeitem]")].find(
      (row) => row.textContent.trim() === "upgrade-page.html",
    );
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: 80,
        clientY: 100,
      }),
    );
    await click("Move to…");
    await click("upgrade-assets/");
    await click("Move here");
    await until(
      () =>
        document.querySelector("[role=tab][aria-selected=true]")?.title ===
        "upgrade-assets/upgrade-page.html",
      "moved document path",
    );
    check(
      window.__mideView.state.doc.toString().endsWith("<!-- unsaved -->"),
      "move preserves unsaved buffer",
    );
    await wait(200);
    check(
      !document.querySelector(".image-gutter-marker"),
      "relative image paths re-evaluated after move",
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await until(
      () => document.getElementById("preference-thumbnails"),
      "preview preferences",
    );
    document.getElementById("preference-thumbnails").click();
    await click("Back to Editor");
    check(
      !document.querySelector(".cm-image-gutter"),
      "thumbnail preference takes effect immediately",
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await until(
      () => document.getElementById("preference-thumbnails"),
      "preview preferences again",
    );
    document.getElementById("preference-thumbnails").click();
    await click("Back to Editor");
    const imports = await invoke("import_files", {
      paths: [
        "/tmp/mide-upgrade-external.svg",
        "/tmp/mide-upgrade-external.svg",
        "/tmp",
      ],
      directory: "upgrade-assets",
    });
    check(
      imports.copied.length === 1 && imports.failed.length === 2,
      "native batch import reports collisions and rejects folders",
    );
    const imported = await invoke("read_image", {
      path: "upgrade-assets/mide-upgrade-external.svg",
    });
    check(
      imported.mime === "image/svg+xml" && imported.size > 0,
      "imported image can be read",
    );
    await invoke("smoke_report", { success: true, report: results.join("\n") });
  } catch (error) {
    await invoke("smoke_report", {
      success: false,
      report:
        results.join("\n") +
        "\nFAIL " +
        error.message +
        "\n" +
        (error.stack || error),
    });
  }
})();
