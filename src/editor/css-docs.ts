// Original short explanations; property links use MDN's CSS reference.
export interface CssDocumentation {
  description: string;
  example: string;
}
const properties: Record<string, [string, string]> = {
  display: [
    "Chooses the layout mode of an element and its children.",
    "display: flex;",
  ],
  position: [
    "Chooses how an element is placed in the document.",
    "position: relative;",
  ],
  top: [
    "Offsets a positioned element from its top reference edge.",
    "top: 1rem;",
  ],
  right: [
    "Offsets a positioned element from its right reference edge.",
    "right: 0;",
  ],
  bottom: [
    "Offsets a positioned element from its bottom reference edge.",
    "bottom: 0;",
  ],
  left: [
    "Offsets a positioned element from its left reference edge.",
    "left: 1rem;",
  ],
  inset: [
    "Sets the top, right, bottom and left offsets together.",
    "inset: 0;",
  ],
  "z-index": [
    "Controls stacking order within an element's stacking context.",
    "z-index: 10;",
  ],
  "box-sizing": [
    "Chooses whether width and height include padding and borders.",
    "box-sizing: border-box;",
  ],
  width: ["Sets the width of an element's box.", "width: 80%;"],
  height: ["Sets the height of an element's box.", "height: 12rem;"],
  "min-width": [
    "Prevents the box from becoming narrower than this size.",
    "min-width: 0;",
  ],
  "max-width": ["Limits how wide the box may become.", "max-width: 60rem;"],
  "min-height": [
    "Prevents the box from becoming shorter than this size.",
    "min-height: 100vh;",
  ],
  "max-height": ["Limits how tall the box may become.", "max-height: 20rem;"],
  "inline-size": [
    "Sets box size along the inline axis of its writing mode.",
    "inline-size: 100%;",
  ],
  "block-size": [
    "Sets box size along the block axis of its writing mode.",
    "block-size: 10rem;",
  ],
  margin: [
    "Adds space outside the border. One to four values set the sides.",
    "margin: 0 auto;",
  ],
  padding: [
    "Adds space between content and border. One to four values set the sides.",
    "padding: 1rem 2rem;",
  ],
  border: [
    "Sets border width, style and color together.",
    "border: 1px solid #777;",
  ],
  "border-width": ["Sets the thickness of borders.", "border-width: 2px;"],
  "border-style": ["Chooses how borders are drawn.", "border-style: solid;"],
  "border-color": ["Sets the color of borders.", "border-color: currentColor;"],
  "border-radius": [
    "Rounds the corners of the border box.",
    "border-radius: 8px;",
  ],
  outline: [
    "Draws an outline without taking up layout space. Preserve visible keyboard focus.",
    "outline: 2px solid blue;",
  ],
  "outline-offset": [
    "Sets space between an outline and the element's border.",
    "outline-offset: 3px;",
  ],
  "box-shadow": [
    "Adds one or more shadows around an element's box.",
    "box-shadow: 0 2px 6px #0003;",
  ],
  color: ["Sets text color and the value of currentColor.", "color: #243447;"],
  background: [
    "Combines background color, image, position and other background settings.",
    "background: #f5f5f5;",
  ],
  "background-color": [
    "Sets the color painted behind content and background images.",
    "background-color: white;",
  ],
  "background-image": [
    "Adds background images or gradients.",
    'background-image: url("photo.jpg");',
  ],
  "background-size": [
    "Chooses how large background images are drawn.",
    "background-size: cover;",
  ],
  "background-position": [
    "Positions background images within their painting area.",
    "background-position: center;",
  ],
  "background-repeat": [
    "Controls whether background images tile.",
    "background-repeat: no-repeat;",
  ],
  opacity: [
    "Sets transparency for an element and all of its contents together.",
    "opacity: 0.5;",
  ],
  visibility: [
    "Controls visibility while normally preserving the element's layout space.",
    "visibility: hidden;",
  ],
  overflow: [
    "Controls content that extends beyond the box.",
    "overflow: auto;",
  ],
  "overflow-x": [
    "Controls overflow along the horizontal axis.",
    "overflow-x: auto;",
  ],
  "overflow-y": [
    "Controls overflow along the vertical axis.",
    "overflow-y: auto;",
  ],
  "object-fit": [
    "Chooses how image or video content fits its own box.",
    "object-fit: cover;",
  ],
  "object-position": [
    "Aligns image or video content inside its box.",
    "object-position: center;",
  ],
  "aspect-ratio": [
    "Provides a preferred width-to-height ratio for sizing a box.",
    "aspect-ratio: 16 / 9;",
  ],
  flex: [
    "Combines a flex item's growth, shrinkage and starting size.",
    "flex: 1 1 0;",
  ],
  "flex-direction": [
    "Chooses the main axis along which flex items are arranged.",
    "flex-direction: column;",
  ],
  "flex-wrap": [
    "Controls whether flex items may wrap onto additional lines.",
    "flex-wrap: wrap;",
  ],
  "flex-flow": [
    "Sets flex direction and wrapping together.",
    "flex-flow: row wrap;",
  ],
  "flex-grow": [
    "Sets an item's share of available space in a flex container.",
    "flex-grow: 1;",
  ],
  "flex-shrink": [
    "Sets how a flex item participates in shrinking when space is short.",
    "flex-shrink: 0;",
  ],
  "flex-basis": [
    "Sets a flex item's initial main-axis size before growth or shrinkage.",
    "flex-basis: 15rem;",
  ],
  "justify-content": [
    "Distributes space along the main axis in flexbox or inline axis in grid.",
    "justify-content: space-between;",
  ],
  "align-items": [
    "Sets the default cross-axis alignment of flex items or block-axis alignment of grid items.",
    "align-items: center;",
  ],
  "align-self": [
    "Overrides alignment for an individual flex or grid item.",
    "align-self: start;",
  ],
  "align-content": [
    "Aligns or distributes content such as flex lines or grid tracks along the relevant axis.",
    "align-content: start;",
  ],
  "justify-items": [
    "Sets default inline-axis alignment of items, especially in grid layouts.",
    "justify-items: center;",
  ],
  "justify-self": [
    "Sets an individual item's inline-axis alignment; it does not align flex items.",
    "justify-self: end;",
  ],
  "place-items": [
    "Sets align-items and justify-items together.",
    "place-items: center;",
  ],
  "place-content": [
    "Sets align-content and justify-content together.",
    "place-content: center;",
  ],
  gap: [
    "Sets spacing between rows and columns in grid, flex and multi-column layouts.",
    "gap: 1rem;",
  ],
  "row-gap": ["Sets spacing between rows or flex lines.", "row-gap: 1rem;"],
  "column-gap": [
    "Sets spacing between columns or items along a flex row.",
    "column-gap: 2rem;",
  ],
  order: [
    "Changes visual order of flex or grid items, without changing DOM or reading order.",
    "order: 1;",
  ],
  "grid-template-columns": [
    "Defines the explicit columns of a grid.",
    "grid-template-columns: repeat(3, 1fr);",
  ],
  "grid-template-rows": [
    "Defines the explicit rows of a grid.",
    "grid-template-rows: auto 1fr auto;",
  ],
  "grid-template-areas": [
    "Names grid areas using a row-by-row text pattern.",
    'grid-template-areas: "header header" "nav main";',
  ],
  "grid-column": [
    "Places a grid item between column lines or makes it span columns.",
    "grid-column: 1 / -1;",
  ],
  "grid-row": [
    "Places a grid item between row lines or makes it span rows.",
    "grid-row: span 2;",
  ],
  "grid-area": [
    "Assigns a grid item to a named area or specifies its boundary lines.",
    "grid-area: main;",
  ],
  "grid-auto-flow": [
    "Controls automatic placement of grid items.",
    "grid-auto-flow: row;",
  ],
  "grid-auto-columns": [
    "Sets sizes for grid columns created implicitly.",
    "grid-auto-columns: 1fr;",
  ],
  "grid-auto-rows": [
    "Sets sizes for grid rows created implicitly.",
    "grid-auto-rows: minmax(5rem, auto);",
  ],
  "font-family": [
    "Lists preferred font families, followed by fallbacks.",
    "font-family: Arial, sans-serif;",
  ],
  "font-size": ["Sets the size of text.", "font-size: 1rem;"],
  "font-weight": ["Sets the weight or boldness of text.", "font-weight: 600;"],
  "font-style": [
    "Chooses normal, italic or oblique text.",
    "font-style: italic;",
  ],
  "line-height": [
    "Sets line box height. Unitless values scale with each element's font size.",
    "line-height: 1.5;",
  ],
  "letter-spacing": [
    "Adjusts spacing between text characters.",
    "letter-spacing: 0.02em;",
  ],
  "text-align": [
    "Aligns inline content within a block.",
    "text-align: center;",
  ],
  "text-decoration": [
    "Sets decorations such as underlines, including their style and color.",
    "text-decoration: underline;",
  ],
  "text-transform": [
    "Changes displayed capitalization without changing the source text.",
    "text-transform: uppercase;",
  ],
  "text-overflow": [
    "Chooses how clipped inline overflow is indicated; clipping must be configured separately.",
    "text-overflow: ellipsis;",
  ],
  "white-space": [
    "Controls whitespace handling and line wrapping.",
    "white-space: nowrap;",
  ],
  "overflow-wrap": [
    "Allows extra line breaks when a word would otherwise overflow.",
    "overflow-wrap: anywhere;",
  ],
  "word-break": [
    "Controls where breaks can occur within words.",
    "word-break: normal;",
  ],
  "list-style": [
    "Combines marker type, position and image for list items.",
    "list-style: square inside;",
  ],
  "vertical-align": [
    "Aligns inline-level or table-cell boxes vertically; it does not center flex items.",
    "vertical-align: middle;",
  ],
  cursor: [
    "Chooses the pointer shape shown over an element.",
    "cursor: pointer;",
  ],
  "pointer-events": [
    "Controls whether an element can be the target of pointer events.",
    "pointer-events: none;",
  ],
  "user-select": [
    "Controls whether users can select text.",
    "user-select: none;",
  ],
  resize: [
    "Allows the user to resize an element when its other layout settings permit it.",
    "resize: vertical;",
  ],
  transform: [
    "Transforms the element visually without moving surrounding layout boxes.",
    "transform: translateX(1rem);",
  ],
  "transform-origin": [
    "Sets the reference point for transformations.",
    "transform-origin: center;",
  ],
  transition: [
    "Animates supported property changes over a specified duration.",
    "transition: opacity 150ms ease;",
  ],
  "transition-property": [
    "Chooses which properties participate in transitions.",
    "transition-property: opacity;",
  ],
  "transition-duration": [
    "Sets how long a transition lasts.",
    "transition-duration: 150ms;",
  ],
  "transition-timing-function": [
    "Chooses the rate of change during a transition.",
    "transition-timing-function: ease-out;",
  ],
  animation: [
    "Combines settings for a named @keyframes animation.",
    "animation: fade 1s ease;",
  ],
  "animation-name": [
    "Selects an animation defined by @keyframes.",
    "animation-name: fade;",
  ],
  "animation-duration": [
    "Sets the duration of one animation cycle.",
    "animation-duration: 1s;",
  ],
  "animation-iteration-count": [
    "Sets how many times an animation repeats.",
    "animation-iteration-count: 2;",
  ],
  "scroll-behavior": [
    "Controls smooth or immediate scrolling initiated by navigation or scrolling APIs.",
    "scroll-behavior: smooth;",
  ],
};
for (const side of [
  "top",
  "right",
  "bottom",
  "left",
  "block",
  "inline",
  "block-start",
  "block-end",
  "inline-start",
  "inline-end",
]) {
  for (const property of ["margin", "padding"])
    properties[`${property}-${side}`] = [
      `Sets ${property === "margin" ? "outer spacing" : "inner spacing"} for the ${side} side or axis. Logical sides follow the writing mode.`,
      `${property}-${side}: 1rem;`,
    ];
}
export const cssDocumentation: Record<string, CssDocumentation> =
  Object.fromEntries(
    Object.entries(properties).map(([name, [description, example]]) => [
      name,
      { description, example },
    ]),
  );
export function mdnCssUrl(property: string) {
  return `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/${property}`;
}
