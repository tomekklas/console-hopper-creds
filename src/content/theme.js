// The dialogs follow Console Hopper's own light/dark switch, not the
// operating system's: Console Hopper puts tm_theme_dark on <body> when it is
// dark. The dialogs sit in closed shadow roots, out of reach of a body
// selector, so the theme is passed in as a class on the root's .scrim.

export const hopperIsDark = () =>
  document.body.classList.contains("tm_theme_dark");

// Call apply() after every render (each one replaces the .scrim); it also
// runs whenever Console Hopper flips its theme while the dialog is open.
// stop() when the dialog closes.
export function followHopperTheme(root) {
  const apply = () => {
    const scrim = root.querySelector(".scrim");
    if (scrim) scrim.classList.toggle("dark", hopperIsDark());
  };
  const observer = new MutationObserver(apply);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return { apply, stop: () => observer.disconnect() };
}
