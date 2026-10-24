(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const results = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, name) => {
    for (let i = 0; i < 160; i++) {
      const value = predicate();
      if (value) return value;
      await wait(50);
    }
    throw new Error(`Timed out: ${name}`);
  };
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    results.push(`PASS ${name}`);
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (element) =>
        element.textContent.trim() === text ||
        element.querySelector("span")?.textContent.trim() === text,
    );
  const click = async (text) => {
    (await until(() => button(text), text)).click();
    await wait(80);
  };
  const key = (key, shiftKey = false) =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  const menu = async (text) => {
    await click("Menu");
    await click(text);
  };
  try {
    localStorage.removeItem("mide-theme");
    await until(
      () => document.querySelector(".empty-state button"),
      "initial empty state",
    );
    document.querySelector(".empty-state button").click();
    await until(() => document.querySelector("[role=treeitem]"), "Explorer");
    await click("index.astro");
    const treeIcon = button("index.astro").querySelector(".file-type-icon");
    const tabIcon = document.querySelector("[role=tab] .file-type-icon");
    check(
      treeIcon && tabIcon && getComputedStyle(treeIcon).maskImage !== "none",
      "Astro icons render in Explorer and tab without an installed icon font",
    );
    const darkIconColor = getComputedStyle(treeIcon).backgroundColor;
    const assertTintedIcon = (label) => {
      const icon = document.querySelector(".tree-row.selected .file-type-icon");
      const channels = getComputedStyle(icon)
        .backgroundColor.match(/\d+/g)
        .map(Number);
      check(channels[2] > channels[0] + 20, label);
    };
    assertTintedIcon(
      "Dark theme file icons have a blue tint, including selected files",
    );
    const view = await until(() => window.__mideView, "CodeMirror");
    check(view.state.doc.toString().includes("Hello"), "open Astro document");
    const assertActiveLine = (label) => {
      const editor = window.__mideView;
      const line = document.querySelector(".cm-content .cm-activeLine");
      const number = document.querySelector(
        ".cm-lineNumbers .cm-activeLineGutter",
      );
      const expected = editor.state.doc.lineAt(
        editor.state.selection.main.head,
      ).number;
      check(
        line &&
          number?.textContent === String(expected) &&
          getComputedStyle(line).backgroundColor !==
            getComputedStyle(editor.dom).backgroundColor &&
          getComputedStyle(line).backgroundColor !== "rgba(0, 0, 0, 0)",
        label,
      );
    };
    assertActiveLine("current line and line number are highlighted");
    const selectionDocument = view.state.doc;
    view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
    await wait(80);
    assertActiveLine("line highlight follows cursor movement");
    check(
      view.state.doc.eq(selectionDocument),
      "line highlight does not edit the document",
    );
    key("0");
    await wait(80);
    const assertLineAlignment = (label) => {
      const editor = window.__mideView;
      const numbers = [
        ...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
      ].filter((element) => getComputedStyle(element).visibility !== "hidden");
      const lines = [...document.querySelectorAll(".cm-content .cm-line")];
      const offsets = numbers.map((number, index) => ({
        number: number.textContent,
        offset:
          number.getBoundingClientRect().top -
          lines[index].getBoundingClientRect().top,
      }));
      check(
        offsets.every((item) => Math.abs(item.offset) <= 1),
        `${label}: ${JSON.stringify(offsets)}`,
      );
    };
    assertLineAlignment("initial line alignment");
    const originalDocument = view.state.doc;
    const editorSize = () =>
      parseFloat(
        getComputedStyle(document.querySelector(".cm-editor")).fontSize,
      );
    key("+");
    await wait(80);
    check(editorSize() === 15, "Ctrl+plus increases editor text");
    key("=");
    await wait(80);
    check(editorSize() === 16, "Ctrl+equals increases editor text");
    assertLineAlignment("zoomed line alignment");
    for (let i = 0; i < 16; i++) key("+");
    await wait(200);
    assertLineAlignment("large font line alignment");
    key("0");
    await wait(100);
    key("+");
    key("+");
    await wait(100);
    key("-");
    await wait(80);
    check(editorSize() === 15, "Ctrl+minus decreases editor text");
    key("0");
    await wait(80);
    check(
      editorSize() === 14 && view.state.doc.eq(originalDocument),
      "Ctrl+0 resets size without editing text",
    );

    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: "\n<!-- ruční psaní -->",
      },
    });
    await until(() => document.querySelector(".dirty"), "dirty tab");
    check(!!document.querySelector(".dirty"), "unsaved indicator");
    key("s");
    await until(() => !document.querySelector(".dirty"), "save");
    check(
      (await invoke("read_file", { path: "index.astro" })).text.includes(
        "ruční psaní",
      ),
      "save through Rust filesystem",
    );
    await click("other.ts");
    check(
      window.__mideView.state.doc.toString().includes("count"),
      "switch to TypeScript tab",
    );
    await wait(100);
    assertLineAlignment("TypeScript tab line alignment");
    await click("index.astro");
    check(
      window.__mideView.state.doc.toString().includes("ruční psaní"),
      "retain Astro state across tabs",
    );
    await menu("Find");
    const input = await until(
      () => document.querySelector(".find-panel input"),
      "Find panel",
    );
    input.value = "Hello";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(80);
    check(
      !!document.querySelector(".cm-searchMatch"),
      "find highlights matches",
    );
    check(
      document.querySelector(".find-count").textContent === "1 match",
      "Find shows occurrence count",
    );
    window.__mideView.dispatch({
      changes: {
        from: window.__mideView.state.doc.length,
        insert: "\n<!-- Hello -->",
      },
    });
    check(
      document.querySelector(".find-count").textContent === "2 matches",
      "Find count updates after editing",
    );
    input.value = "NoSuchMatch987";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    check(
      document.querySelector(".find-count").textContent === "0 matches",
      "Find shows zero occurrences",
    );
    window.__mideView.dispatch({
      changes: {
        from: window.__mideView.state.doc.length - "\n<!-- Hello -->".length,
        to: window.__mideView.state.doc.length,
      },
    });
    await click("Close");
    const beforeSettings = window.__mideView.state.doc;
    const changeField = async (element, value) => {
      const prototype =
        element.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(
        element,
        value,
      );
      element.dispatchEvent(
        new Event(element.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
      await wait(100);
    };
    await menu("Settings");
    check(
      !!document.querySelector(".settings-page") &&
        getComputedStyle(document.querySelector(".editor-host")).display ===
          "none",
      "settings opens as a separate page",
    );
    const systemFonts = await invoke("list_system_fonts");
    const monoFonts = systemFonts.filter((font) => font.monospace);
    check(
      systemFonts.length > 0 && monoFonts.length > 0,
      `native font discovery finds ${systemFonts.length} families, ${monoFonts.length} monospace`,
    );
    await until(
      () =>
        document.querySelectorAll("#editor-font optgroup option").length ===
        monoFonts.length,
      "installed font choices",
    );
    const monoNames = new Set(monoFonts.map((font) => font.name));
    check(
      [...document.querySelectorAll("#editor-font optgroup option")].every(
        (option) => monoNames.has(option.value),
      ),
      "editor font selector contains only installed monospace families",
    );
    check(
      document.querySelectorAll("#interface-font optgroup option").length ===
        systemFonts.length,
      "interface selector lists all installed families",
    );
    await changeField(
      document.querySelector("#editor-font"),
      monoFonts[0].name,
    );
    check(
      document.querySelector("#editor-font").value === monoFonts[0].name &&
        localStorage.getItem("mide-editor-font") === monoFonts[0].name,
      "selecting an installed font applies and persists it",
    );
    await changeField(document.querySelector("#interface-font"), "serif");
    check(
      getComputedStyle(document.documentElement).fontFamily.startsWith(
        "serif",
      ) && localStorage.getItem("mide-interface-font") === "serif",
      "interface font applies and persists",
    );
    await changeField(document.querySelector("#interface-font"), "custom");
    const customInterface = document.querySelector(
      '[aria-label="Interface font name"]',
    );
    await changeField(customInterface, "Liberation ");
    check(
      customInterface.value === "Liberation ",
      "interface font field preserves spaces while typing",
    );
    await changeField(customInterface, "Liberation Sans");
    await changeField(document.querySelector("#editor-font"), "custom");
    const customFont = document.querySelector(
      '[aria-label="Editor font name"]',
    );
    await changeField(customFont, "Liberation ");
    check(
      customFont.value === "Liberation ",
      "custom font field preserves spaces while typing",
    );
    await changeField(customFont, "Liberation Mono");
    await changeField(document.querySelector("#editor-text-size"), "18");
    document
      .querySelector('input[name="application-theme"][value="light"]')
      .click();
    await wait(100);
    check(
      localStorage.getItem("mide-editor-font") === "Liberation Mono" &&
        localStorage.getItem("mide-font-size") === "18" &&
        document.documentElement.dataset.theme === "light",
      "editor font, size and theme apply from settings",
    );
    const previewStyle = getComputedStyle(
      document.querySelector(".settings-code code"),
    );
    check(
      previewStyle.fontFamily.includes("Liberation Mono") &&
        previewStyle.fontSize === "18px",
      "live code preview uses the selected font and size",
    );
    check(
      window.__mideView.state.doc.eq(beforeSettings),
      "settings preserves the open document",
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(100);
    check(
      !document.querySelector(".settings-page") &&
        getComputedStyle(window.__mideView.dom).fontSize === "18px",
      "Escape returns to editor with new font size",
    );
    assertLineAlignment("font settings preserve line alignment");
    key(",");
    await wait(100);
    check(
      !!document.querySelector(".settings-page"),
      "Ctrl+comma opens Settings",
    );
    await until(
      () =>
        document.querySelectorAll("#editor-font optgroup option").length > 0,
      "reloaded installed fonts",
    );
    if (monoNames.has("Liberation Mono"))
      check(
        document.querySelector("#editor-font").value === "Liberation Mono" &&
          !document.querySelector('[aria-label="Editor font name"]'),
        "saved installed font is restored in the selector",
      );
    await changeField(document.querySelector("#interface-font"), "");
    await changeField(document.querySelector("#editor-font"), "");
    await changeField(document.querySelector("#editor-text-size"), "14");
    (
      await until(
        () => [...document.querySelectorAll(".settings-header button")][0],
        "Back to Editor",
      )
    ).click();
    await wait(100);
    if (document.documentElement.dataset.theme !== "light")
      await menu("Light Theme");
    check(document.documentElement.dataset.theme === "light", "light theme");
    assertActiveLine("current line is highlighted in Light theme");
    check(
      getComputedStyle(
        document.querySelector(".tree-row.selected .file-type-icon"),
      ).backgroundColor !== darkIconColor,
      "monochrome file icons follow the selected theme",
    );
    assertTintedIcon(
      "Light theme file icons have a blue tint, including selected files",
    );
    await menu("Keyboard Shortcuts");
    check(
      !!document.querySelector(".shortcuts-dialog[open]") &&
        document
          .querySelector(".shortcuts-dialog")
          .textContent.includes("Ctrl + Shift + Enter"),
      "shortcut reference includes Focus Mode exit",
    );
    await click("Close");
    key("Enter", true);
    await wait(80);
    check(
      !!document.querySelector(".focus-hint"),
      "Focus Mode shows exit instructions",
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F1",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(80);
    check(
      !!document.querySelector(".shortcuts-dialog[open]"),
      "F1 opens shortcuts inside Focus Mode",
    );
    await click("Close");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(80);
    check(!document.querySelector(".focus-mode"), "Escape exits Focus Mode");
    key("Enter", true);
    await wait(80);
    check(
      getComputedStyle(document.querySelector(".explorer")).display ===
        "none" &&
        getComputedStyle(document.querySelector(".status")).display === "none",
      "Focus Mode hides Explorer and status bar",
    );
    check(
      getComputedStyle(document.querySelector(".tabs")).display !== "none",
      "Focus Mode keeps file tabs visible",
    );
    await click("other.ts");
    check(
      window.__mideView.state.doc.toString().includes("count") &&
        !!document.querySelector(".focus-mode"),
      "switch files using tabs inside Focus Mode",
    );
    await click("index.astro");
    key("Enter", true);
    await wait(80);
    check(
      getComputedStyle(document.querySelector(".explorer")).display !== "none",
      "Focus Mode restores layout",
    );
    const editor = window.__mideView;
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: '---\nconst title="Hello"\n---\n<main><h1>{title}</h1></main>',
      },
    });
    const beforeFormat = editor.state.doc.toString();
    key("f", true);
    await until(
      () =>
        window.__mideView.state.doc
          .toString()
          .includes('const title = "Hello";'),
      "Format Document",
    );
    check(
      !!document.querySelector(".dirty"),
      "explicit format leaves document unsaved",
    );
    editor.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(80);
    check(
      editor.state.doc.toString() === beforeFormat,
      "format is one isolated undo step",
    );
    await invoke("create_entry", { path: "temporary", directory: true });
    await invoke("create_entry", {
      path: "temporary/žluťoučký.md",
      directory: false,
    });
    await invoke("rename_entry", {
      path: "temporary/žluťoučký.md",
      destination: "temporary/renamed.md",
    });
    check(
      (await invoke("list_directory", { path: "temporary" })).some(
        (entry) => entry.name === "renamed.md",
      ),
      "create directory/file and rename through Rust",
    );
    await invoke("delete_entry", { path: "temporary" });
    check(
      !(await invoke("list_directory", { path: "" })).some(
        (entry) => entry.name === "temporary",
      ),
      "delete directory through Rust",
    );
    await menu("Dark Theme");
    check(document.documentElement.dataset.theme === "dark", "dark theme");
    assertActiveLine("current line is highlighted in Dark theme");
    check(
      document.documentElement.scrollWidth === innerWidth,
      "no horizontal layout overflow",
    );
    await menu("Toggle Terminal");
    await until(
      () => document.querySelector(".xterm-screen"),
      "terminal mount",
    );
    await until(
      () =>
        document.querySelector(".terminal-panel .xterm-rows")?.textContent
          .length > 0 || document.querySelector(".xterm-screen canvas"),
      "terminal renderer",
    );
    check(await invoke("terminal_running"), "real system shell is running");
    const terminal = await until(
      () => window.__mideTerminal,
      "terminal test handle",
    );
    const terminalPanel = document.querySelector(".terminal-panel");
    const divider = document.querySelector(".terminal-resizer");
    const originalSession = window.__mideTerminalId;
    const dragTerminal = async (delta) => {
      const y = divider.getBoundingClientRect().top + 2;
      // DOM-synthetic pointers cannot own native capture; verify that the
      // handler requests capture, then deliver its captured move/up sequence.
      const nativeCapture = divider.setPointerCapture;
      let captured = false;
      divider.setPointerCapture = () => {
        captured = true;
      };
      try {
        for (const [type, clientY] of [
          ["pointerdown", y],
          ["pointermove", y - delta],
          ["pointerup", y - delta],
        ]) {
          divider.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: "mouse",
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
              clientY,
              bubbles: true,
              cancelable: true,
            }),
          );
          await wait(80);
        }
        check(captured, "terminal divider requests pointer capture");
      } finally {
        divider.setPointerCapture = nativeCapture;
      }
    };
    const originalHeight = terminalPanel.getBoundingClientRect().height;
    const originalRows = terminal.rows;
    await dragTerminal(-40);
    check(
      Math.abs(
        terminalPanel.getBoundingClientRect().height - (originalHeight - 40),
      ) < 2 && terminal.rows < originalRows,
      "drag top edge down shrinks terminal and refits rows",
    );
    const smallRows = terminal.rows;
    await dragTerminal(30);
    check(
      Math.abs(
        terminalPanel.getBoundingClientRect().height - (originalHeight - 10),
      ) < 2 && terminal.rows > smallRows,
      "drag top edge up grows terminal and refits rows",
    );
    divider.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(100);
    check(
      document.querySelector(".editor-host").getBoundingClientRect().height >=
        99,
      "terminal maximum height leaves room for editor",
    );
    divider.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(80);
    check(
      Math.abs(terminalPanel.getBoundingClientRect().height - 120) < 2,
      "terminal minimum height is enforced",
    );
    divider.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(80);
    check(
      Math.abs(terminalPanel.getBoundingClientRect().height - 140) < 2,
      "terminal divider supports keyboard resize",
    );
    const resizedHeight = terminalPanel.getBoundingClientRect().height;
    key(",");
    await wait(100);
    check(
      !!document.querySelector(".settings-page") &&
        (await invoke("terminal_running")),
      "opening Settings preserves the shell",
    );
    await changeField(document.querySelector("#editor-font"), "monospace");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(120);
    check(
      Math.abs(terminalPanel.getBoundingClientRect().height - resizedHeight) <
        2 &&
        window.__mideTerminalId === originalSession &&
        terminal.options.fontFamily.startsWith("monospace"),
      "Settings preserves terminal height and applies its font",
    );

    check(
      window.__mideTerminalId === originalSession &&
        (await invoke("terminal_running")),
      "resizing preserves the running shell",
    );
    const terminalLine = (text) => {
      const buffer = terminal.buffer.active;
      for (let i = 0; i < buffer.length; i++)
        if (buffer.getLine(i)?.translateToString(true).trim() === text)
          return true;
      return false;
    };
    await invoke("terminal_write", {
      id: window.__mideTerminalId,
      data: "printf '\\nMIDE_žluťoučký_READY\\n'\r",
    });
    await until(
      () => terminalLine("MIDE_žluťoučký_READY"),
      "PTY Unicode output",
    );
    check(true, "terminal sends input and renders Unicode output");
    await invoke("terminal_write", {
      id: window.__mideTerminalId,
      data: "printf '\\nMIDE_SIZE_'; stty size\r",
    });
    await until(
      () => terminalLine(`MIDE_SIZE_${terminal.rows} ${terminal.cols}`),
      "PTY size follows terminal dimensions",
    );
    check(true, "system PTY receives resized rows and columns");
    await invoke("terminal_write", {
      id: window.__mideTerminalId,
      data: "sleep 30\r",
    });
    await wait(200);
    await invoke("terminal_write", {
      id: window.__mideTerminalId,
      data: "\x03",
    });
    await invoke("terminal_write", {
      id: window.__mideTerminalId,
      data: "printf '\\nMIDE_INTERRUPT_OK\\n'\r",
    });
    await until(() => terminalLine("MIDE_INTERRUPT_OK"), "terminal Ctrl+C");
    check(true, "terminal Ctrl+C interrupts foreground process");

    await menu("Light Theme");
    check(
      terminal.options.theme.background ===
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bg")
          .trim(),
      "terminal theme follows application theme",
    );
    await menu("Dark Theme");
    key("j");
    await wait(80);
    check(
      getComputedStyle(document.querySelector(".terminal-panel")).display ===
        "none",
      "terminal hides",
    );
    check(
      await invoke("terminal_running"),
      "hidden terminal keeps shell alive",
    );
    key("j");
    await wait(80);
    check(
      getComputedStyle(document.querySelector(".terminal-panel")).display !==
        "none",
      "terminal restores",
    );
    check(
      Math.abs(terminalPanel.getBoundingClientRect().height - resizedHeight) <
        2,
      "terminal retains resized height after hiding",
    );
    key("w");
    await until(
      () => document.querySelector("dialog[open]"),
      "unsaved confirmation",
    );
    await click("Cancel");
    check(
      !!document.querySelector("[role=tab][aria-selected=true]"),
      "cancel preserves unsaved tab",
    );
    check(
      !document.querySelector(".error-strip"),
      `no runtime error: ${document.querySelector(".error-strip")?.textContent}`,
    );
    // Exercise import UI without opening a blocking native picker in automation.
    await menu("Settings");
    const priorThemes = localStorage.getItem("mide-custom-themes");
    let themePayload = JSON.stringify({
      version: 1,
      name: "Smoke Theme",
      variant: "light",
      colors: { bg: "#e0e8f0", "terminal-blue": "#123456" },
    });
    await invoke("create_entry", {
      path: "smoke-theme.json",
      directory: false,
    });
    let themeFile = await invoke("read_file", { path: "smoke-theme.json" });
    await invoke("save_file", {
      path: "smoke-theme.json",
      text: themePayload,
      revision: themeFile.revision,
      bom: false,
    });
    try {
      await click("Import Theme…");
      await until(
        () =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--bg")
            .trim() === "#e0e8f0",
        "custom theme applied",
      );
      check(
        JSON.parse(localStorage.getItem("mide-custom-themes")).some(
          (item) => item.name === "Smoke Theme",
        ),
        "imported theme persists locally",
      );
      check(
        terminal.options.theme.blue === "#123456",
        "import updates running terminal ANSI colors",
      );
      themeFile = await invoke("read_file", { path: "smoke-theme.json" });
      await invoke("save_file", {
        path: "smoke-theme.json",
        text: "{broken",
        revision: themeFile.revision,
        bom: false,
      });
      await click("Import Theme…");
      check(
        document.querySelector("[role=alert]") &&
          document.documentElement.dataset.theme === "light",
        "invalid import reports error and preserves current theme",
      );
      document.querySelector('[aria-label="Remove theme Smoke Theme"]').click();
      await wait(80);
      check(
        !document.querySelector('[aria-label="Remove theme Smoke Theme"]') &&
          document.documentElement.style.getPropertyValue("--bg") === "",
        "removing selected import restores base theme",
      );
    } finally {
      await invoke("delete_entry", { path: "smoke-theme.json" });
      if (priorThemes === null) localStorage.removeItem("mide-custom-themes");
      else localStorage.setItem("mide-custom-themes", priorThemes);
    }
    document.querySelector(".settings-header button").click();
    await wait(80);
    const beforeAbout = window.__mideView.state.doc.toString();
    await menu("About mIDE");
    const about = await until(
      () => document.querySelector(".about-dialog[open]"),
      "About dialog",
    );
    check(
      about.textContent.includes("minimal IDE") &&
        about.textContent.includes("Morganczech") &&
        about.querySelector(".about-version").textContent === "0.1.0",
      "About contains app version, purpose and author",
    );
    check(
      about.querySelector("input").value ===
        "https://github.com/Morganczech/mIDE" &&
        about
          .querySelector("pre")
          .textContent.includes("Permission is hereby granted"),
      "About includes repository and complete MIT license",
    );
    key("j");
    check(about.open, "application shortcuts do not interfere with About");
    about.dispatchEvent(new Event("cancel", { cancelable: true }));
    await wait(80);
    check(
      !document.querySelector(".about-dialog") &&
        window.__mideView.contentDOM === document.activeElement &&
        window.__mideView.state.doc.toString() === beforeAbout,
      "About Escape restores editor focus without changing document",
    );
    await menu("About mIDE");
    await click("Close");
    check(
      !document.querySelector(".about-dialog"),
      "About closes with Close button",
    );
    const projectText = window.__mideView.state.doc.toString();
    window.__mideView.dispatch({
      changes: {
        from: window.__mideView.state.doc.length,
        insert: "\n<!-- 😀 MIDE_SEARCH_NEEDLE -->",
      },
    });
    await invoke("create_entry", { path: "search-test.txt", directory: false });
    const searchData = await invoke("read_file", { path: "search-test.txt" });
    await invoke("save_file", {
      path: "search-test.txt",
      revision: searchData.revision,
      bom: false,
      text: "first\n😀 MIDE_SEARCH_NEEDLE again\n",
    });
    try {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      const searchInput = await until(
        () => document.querySelector('[aria-label="Find in project"]'),
        "project search shortcut",
      );
      await changeField(searchInput, "mide_search_needle");
      await click("Search");
      await until(
        () =>
          document.querySelectorAll(".project-search-results li").length === 2,
        "project search results including unsaved file",
      );
      check(
        document
          .querySelector(".search-summary")
          .textContent.includes("2 matches in 2 files"),
        "project search counts matches across disk and unsaved buffers",
      );
      const result = [
        ...document.querySelectorAll(".project-search-results button"),
      ].find((button) => button.textContent.includes("search-test.txt"));
      result.click();
      await until(
        () => window.__mideView.state.doc.toString().startsWith("first"),
        "open global search result",
      );
      check(
        window.__mideView.state.sliceDoc(
          window.__mideView.state.selection.main.from,
          window.__mideView.state.selection.main.to,
        ) === "MIDE_SEARCH_NEEDLE",
        "project search opens exact match with Unicode column",
      );
      const snapshot = window.__mideView.state.doc;
      await menu("Find in Project");
      await click("Close");
      check(
        window.__mideView.state.doc.eq(snapshot),
        "closing project search preserves document",
      );
      await click("index.astro");
      window.__mideView.dispatch({
        changes: {
          from: 0,
          to: window.__mideView.state.doc.length,
          insert: projectText,
        },
      });
    } finally {
      await invoke("delete_entry", { path: "search-test.txt" });
    }
    const mdxSource =
      '---\ntitle: Hello MDX\n---\n\nimport Card from "./Card.astro"\n\nexport const count = 2\n\n# Hello\n\n<Card title="Hello" count={count} />\n';
    await invoke("create_entry", {
      path: "sample-mdx-test.mdx",
      directory: false,
    });
    const mdxData = await invoke("read_file", { path: "sample-mdx-test.mdx" });
    await invoke("save_file", {
      path: "sample-mdx-test.mdx",
      revision: mdxData.revision,
      bom: false,
      text: mdxSource,
    });
    try {
      document.querySelector('[aria-label="Project actions"]').click();
      await click("Refresh");
      await click("sample-mdx-test.mdx");
      await until(
        () => window.__mideView.state.doc.toString() === mdxSource,
        "open MDX document",
      );
      await until(
        () =>
          [...document.querySelectorAll(".cm-content span")].some(
            (span) => span.textContent === "import" && span.className,
          ),
        "MDX highlighting in native WebKit",
      );
      check(
        !!document.querySelector(
          "[role=tab][aria-selected=true] .file-type-icon",
        ),
        "MDX file has a monochrome icon",
      );
      const importToken = () =>
        [...document.querySelectorAll(".cm-content span")].find(
          (span) => span.textContent === "import",
        );
      const darkColor = getComputedStyle(importToken()).color;
      check(
        darkColor !==
          getComputedStyle(document.querySelector(".cm-content")).color,
        "MDX import uses syntax color",
      );
      await menu("Dark Theme");
      await wait(100);
      const currentColor = getComputedStyle(importToken()).color;
      await menu("Light Theme");
      check(
        getComputedStyle(importToken()).color !== currentColor,
        "MDX syntax colors follow theme changes",
      );
      check(
        window.__mideView.state.languageDataAt("autocomplete", 0).length ===
          0 && !document.querySelector(".cm-tooltip-autocomplete"),
        "MDX adds no completion or suggestion UI",
      );
      document
        .querySelector('[aria-label="Close sample-mdx-test.mdx"]')
        .click();
      await wait(100);
    } finally {
      await invoke("delete_entry", { path: "sample-mdx-test.mdx" });
    }
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
