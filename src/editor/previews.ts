import { cssReferences } from "./css-references";
import { cssDocumentation, mdnCssUrl } from "./css-docs";
import {
  Prec,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  hoverTooltip,
  showTooltip,
  closeHoverTooltips,
  hasHoverTooltips,
  keymap,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";
import { backend, errorMessage } from "../lib/backend";
import {
  loadImage,
  imageCard,
  imageDetails,
  type LoadedImage,
  type ImagePreferences,
} from "../lib/images";
import { codeReferences } from "./image-references";
import { htmlDescriptions, mdnElementUrl } from "./html-docs";
const refresh = StateEffect.define<null>();
const gutterTip = StateEffect.define<Tooltip | null>();
const tipState = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) value = null;
    for (const effect of transaction.effects)
      if (effect.is(gutterTip)) value = effect.value;
    return value;
  },
  provide: (field) => showTooltip.from(field),
});
const markerCleanup = new WeakMap<Node, () => void>();
class ImageMarker extends GutterMarker {
  constructor(
    readonly images: LoadedImage[],
    readonly pos: number,
  ) {
    super();
  }
  eq(other: ImageMarker) {
    return (
      this.pos === other.pos &&
      this.images.length === other.images.length &&
      this.images.every((image, i) => image === other.images[i])
    );
  }
  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.className = "image-gutter-marker";
    button.type = "button";
    button.setAttribute(
      "aria-label",
      this.images
        .map((image) => `${image.path}, ${imageDetails(image)}`)
        .join("; "),
    );
    const img = document.createElement("img");
    img.src = this.images[0].url;
    img.alt = "";
    button.append(img);
    if (this.images.length > 1) {
      const count = document.createElement("span");
      count.textContent = `+${this.images.length - 1}`;
      button.append(count);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (view.dom.isConnected)
          view.dispatch({ effects: gutterTip.of(null) });
      }, 150);
    };
    const open = () => {
      clearTimeout(timer);
      if (!button.isConnected || !view.dom.isConnected) return;
      view.dispatch({
        effects: gutterTip.of({
          pos: this.pos,
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "image-hover-list";
            dom.append(...this.images.map(imageCard));
            dom.addEventListener("mouseenter", () => clearTimeout(timer));
            dom.addEventListener("mouseleave", close);
            return { dom, destroy: () => clearTimeout(timer) };
          },
        }),
      });
    };
    button.addEventListener("mouseenter", () => {
      timer = setTimeout(open, 500);
    });
    button.addEventListener("mouseleave", close);
    button.addEventListener("focus", open);
    button.addEventListener("blur", close);
    button.addEventListener("click", open);
    markerCleanup.set(button, () => clearTimeout(timer));
    return button;
  }
  destroy(dom: Node) {
    markerCleanup.get(dom)?.();
    markerCleanup.delete(dom);
  }
}
export function previewExtensions(
  path: string,
  preferences: ImagePreferences,
): Extension {
  if (!/\.(css|html?|jsx|tsx|astro|mdx)$/i.test(path)) return [];
  const plugin = ViewPlugin.fromClass(
    class {
      images = new Map<number, LoadedImage[]>();
      epoch = 0;
      alive = true;
      timer: ReturnType<typeof setTimeout> | undefined;
      constructor(readonly view: EditorView) {
        this.schedule();
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        )
          this.schedule(update.docChanged ? 120 : 0);
      }
      schedule(delay = 0) {
        clearTimeout(this.timer);
        this.epoch++;
        this.images = new Map();
        this.timer = setTimeout(() => {
          if (this.alive) this.scan();
        }, delay);
      }
      scan() {
        const epoch = ++this.epoch,
          state = this.view.state;
        this.images = new Map();
        if (!preferences.thumbnails || /\.css$/i.test(path)) return;
        const refs = this.view.visibleRanges
          .flatMap((range) => codeReferences(state, path, range.from, range.to))
          .filter((ref) => ref.type === "image" && ref.path);
        const unique = [
          ...new Map(refs.map((ref) => [ref.from, ref])).values(),
        ];
        // Schedule after construction/update; CodeMirror forbids nested updates.
        void Promise.allSettled(
          unique.map(async (ref) => ({
            pos: state.doc.lineAt(ref.from).from,
            image: await loadImage(ref.path!),
          })),
        ).then((results) => {
          if (
            !this.alive ||
            epoch !== this.epoch ||
            this.view.state.doc !== state.doc
          )
            return;
          const images = new Map<number, LoadedImage[]>();
          for (const result of results)
            if (result.status === "fulfilled") {
              const { pos, image } = result.value;
              const line = images.get(pos) ?? [];
              line.push(image);
              images.set(pos, line);
            }
          this.images = images;
          this.view.dispatch({ effects: refresh.of(null) });
        });
      }
      destroy() {
        this.alive = false;
        clearTimeout(this.timer);
        this.epoch++;
      }
    },
  );
  return [
    tipState,
    plugin,
    ...(preferences.thumbnails && !/\.css$/i.test(path)
      ? [
          gutter({
            class: "cm-image-gutter",
            renderEmptyElements: true,
            lineMarker: (view, line) => {
              const images = view.plugin(plugin)?.images.get(line.from);
              return images?.length ? new ImageMarker(images, line.from) : null;
            },
            lineMarkerChange: (update) =>
              update.docChanged ||
              update.transactions.some((transaction) =>
                transaction.effects.some((effect) => effect.is(refresh)),
              ),
          }),
        ]
      : []),
    hoverTooltip(
      async (view, pos) => {
        const state = view.state;
        const line = state.doc.lineAt(pos);
        const ref = [
          ...codeReferences(state, path, line.from, line.to),
          ...(preferences.cssHover
            ? cssReferences(state, path, line.from, line.to)
            : []),
        ].find(
          (ref) =>
            pos >= ref.from &&
            pos <= ref.to &&
            (ref.type === "image"
              ? preferences.imageHover
              : ref.type === "css"
                ? preferences.cssHover
                : preferences.htmlHover),
        );
        if (!ref) return null;
        let dom: HTMLElement;
        if (ref.type === "tag" || ref.type === "css") {
          dom = document.createElement("div");
          dom.className = "html-hover-card";
          const title = document.createElement("strong");
          title.textContent = ref.type === "css" ? ref.value : `<${ref.value}>`;
          const description = document.createElement("p");
          description.textContent =
            ref.type === "css"
              ? cssDocumentation[ref.value].description
              : htmlDescriptions[ref.value];
          const link = document.createElement("a");
          link.href =
            ref.type === "css"
              ? mdnCssUrl(ref.value)
              : mdnElementUrl(ref.value);
          link.textContent = "Read on MDN";
          link.addEventListener("click", (event) => {
            event.preventDefault();
            void backend.openSourceUrl(link.href).catch((error) => {
              description.textContent = errorMessage(error);
            });
          });
          dom.append(title, description);
          if (ref.type === "css") {
            const example = document.createElement("code");
            example.className = "css-hover-example";
            example.textContent = cssDocumentation[ref.value].example;
            dom.append(example);
          }
          dom.append(link);
        } else {
          try {
            if (!ref.path)
              throw new Error("Use a supported image path inside the project.");
            dom = imageCard(await loadImage(ref.path));
          } catch (error) {
            dom = document.createElement("div");
            dom.className = "image-hover-card";
            dom.textContent = `${ref.value}: ${errorMessage(error)}`;
          }
        }
        if (view.state.doc !== state.doc) return null;
        return {
          pos: ref.from,
          end: ref.to,
          above: true,
          create: () => ({ dom }),
        };
      },
      { hoverTime: 500, hideOnChange: true },
    ),
    Prec.highest(
      keymap.of([
        {
          key: "Escape",
          run: (view) => {
            const open = !!view.state.field(tipState);
            const hover = hasHoverTooltips(view.state);
            if (open || hover)
              view.dispatch({
                effects: [gutterTip.of(null), closeHoverTooltips],
              });
            return open || hover;
          },
        },
      ]),
    ),
  ];
}
