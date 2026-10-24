import {
  search,
  getSearchQuery,
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  closeSearchPanel,
  openSearchPanel,
} from "@codemirror/search";
import { keymap } from "@codemirror/view";
export const findExtensions = [
  search({
    top: true,
    createPanel(view) {
      const dom = document.createElement("div");
      dom.className = "find-panel";
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Find";
      input.setAttribute("aria-label", "Find in document");
      input.setAttribute("main-field", "true");
      input.value = getSearchQuery(view.state).search;
      input.addEventListener("input", () =>
        view.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({ search: input.value, literal: true }),
          ),
        }),
      );
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSearchPanel(view);
          view.focus();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (event.shiftKey) findPrevious(view);
          else findNext(view);
        }
      });
      dom.append(input);
      for (const [label, action] of [
        ["Previous", () => findPrevious(view)],
        ["Next", () => findNext(view)],
        [
          "Close",
          () => {
            closeSearchPanel(view);
            view.focus();
          },
        ],
      ] as const) {
        const button = document.createElement("button");
        button.textContent = label;
        button.type = "button";
        button.addEventListener("click", action);
        dom.append(button);
      }
      return {
        dom,
        mount() {
          input.focus();
          input.select();
        },
      };
    },
  }),
  keymap.of([{ key: "Mod-f", run: openSearchPanel }]),
];
