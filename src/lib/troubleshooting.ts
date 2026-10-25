export interface TroubleshootingGuide {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  steps: { title: string; detail: string; example?: string }[];
  url: string;
}
export const troubleshootingGuides: TroubleshootingGuide[] = [
  {
    id: "css-not-loading",
    title: "CSS is not loading",
    summary:
      "Start with the saved files and the stylesheet request before changing selectors.",
    tags: ["CSS", "HTML", "Paths", "Network"],
    steps: [
      {
        title: "Save both files",
        detail:
          "Save the HTML and CSS tabs. Start Go Live and open the page you are editing in your browser.",
      },
      {
        title: "Check the stylesheet link",
        detail:
          "Put a stylesheet link in the HTML head. Resolve href from the HTML file's folder; use the exact filename and letter case.",
        example: '<link rel="stylesheet" href="styles.css">',
      },
      {
        title: "Inspect the request",
        detail:
          "Open the browser developer tools, select Network and reload. Find the CSS request. A 404 means the requested path was not found; open its URL and compare it with your project files.",
      },
      {
        title: "Check the response",
        detail:
          "Confirm the response contains your saved CSS. If it is an older version, reload with cache disabled while developer tools are open. If the CSS arrives correctly, continue with the rule troubleshooting guide.",
      },
    ],
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Debugging_CSS",
  },
  {
    id: "image-missing",
    title: "An image is missing",
    summary:
      "Check the file, its path and the response returned by the browser.",
    tags: ["HTML", "CSS", "Images", "Paths", "Network"],
    steps: [
      {
        title: "Open the image in Explorer",
        detail:
          "Click the image file. If its preview fails, check the format and file contents before changing your HTML.",
      },
      {
        title: "Follow the path from the referring file",
        detail:
          "An img src is relative to the HTML file. A CSS background URL is relative to the stylesheet. Check folder names, filename case and extension.",
        example:
          '<img src="images/photo.png" alt="A description of the photo">',
      },
      {
        title: "Use the source preview",
        detail:
          "Hover over a local img src in mIDE. A thumbnail confirms that mIDE can load that project file. Framework routing, base URLs and CSS visibility can still change what the browser displays.",
      },
      {
        title: "Inspect the browser result",
        detail:
          "Reload with Network open and inspect the image request. If the image loads but stays invisible, inspect its computed width, height, display and opacity. Keep useful alt text for people who cannot see the image.",
      },
    ],
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/HTML_images",
  },
  {
    id: "css-rule",
    title: "CSS loads but a rule has no effect",
    summary:
      "Find out whether the selector matches and which declaration actually wins.",
    tags: ["CSS", "Selectors", "Cascade", "DevTools"],
    steps: [
      {
        title: "Inspect the intended element",
        detail:
          "Use Inspect in the browser and check its actual classes, attributes and parent elements. Compare them with the selector you wrote.",
      },
      {
        title: "Find the declaration",
        detail:
          "Look for your rule in the Styles panel. Check spelling, values and any surrounding media query. A crossed-out declaration can indicate an override or an invalid value; inspect the browser's explanation.",
      },
      {
        title: "Check the computed result",
        detail:
          "Use Computed to see the resulting value and its source. Check inheritance, specificity and rule order before adding !important.",
      },
      {
        title: "Test one change",
        detail:
          "Toggle one declaration in developer tools and observe the result. Remember which element controls the layout: display: flex belongs on the parent of the items. Copy the successful change back to the file and save it.",
      },
    ],
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Debugging_CSS",
  },
  {
    id: "button-not-working",
    title: "A button does nothing",
    summary:
      "Check JavaScript loading, the first error and the event handler in that order.",
    tags: ["JavaScript", "HTML", "Console", "Events", "DOM"],
    steps: [
      {
        title: "Check that the script arrives",
        detail:
          "Save the files and reload with Network open. Verify the script URL and response. For a regular external script that needs the HTML elements, defer waits until parsing is complete.",
        example: '<script src="app.js" defer></script>',
      },
      {
        title: "Read the first console error",
        detail:
          "Open Console and reload. Follow the first error's file and line number, fix it and reload again. One early error can prevent later handlers from being attached.",
      },
      {
        title: "Check the selected element",
        detail:
          "Compare the selector with the HTML. querySelector returns null when nothing matches. Confirm the element exists when the script runs.",
        example:
          'const button = document.querySelector("#save");\nconsole.log(button);',
      },
      {
        title: "Observe the event",
        detail:
          'Put console.log inside the click handler. Register the handler as a function. If a form submission reloads the page, decide whether you need a submit handler or a button with type="button".',
        example:
          'button.addEventListener("click", () => { console.log("clicked"); });',
      },
    ],
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/What_went_wrong",
  },
  {
    id: "small-screen",
    title: "The layout breaks on a small screen",
    summary:
      "Find the element forcing extra width instead of hiding the overflow.",
    tags: ["CSS", "HTML", "Responsive", "Layout", "Box model"],
    steps: [
      {
        title: "Check the viewport",
        detail:
          "Include a viewport declaration in the HTML head. Use the browser's responsive mode to reproduce the problem at a specific width.",
        example:
          '<meta name="viewport" content="width=device-width, initial-scale=1">',
      },
      {
        title: "Find the overflowing element",
        detail:
          "Inspect fixed widths, large images, long words and unbroken text. Temporarily disable suspicious width or min-width declarations one at a time.",
      },
      {
        title: "Check the box model and layout",
        detail:
          "Inspect content, padding and border sizes. border-box includes padding and borders in an explicit width. A flex item may need min-width: 0; a flex container may need wrapping.",
      },
      {
        title: "Verify the correction",
        detail:
          "Save the smallest useful change and retest narrow and wide screens, zoomed text and keyboard navigation. Avoid using overflow: hidden merely to conceal inaccessible content.",
      },
    ],
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design",
  },
];
export function findTroubleshootingGuides(
  query: string,
): TroubleshootingGuide[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return troubleshootingGuides.filter((guide) => {
    const text =
      `${guide.title} ${guide.summary} ${guide.tags.join(" ")} ${guide.steps.map((step) => `${step.title} ${step.detail} ${step.example ?? ""}`).join(" ")}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
