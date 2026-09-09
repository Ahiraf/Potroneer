// Keyboard and screen-reader behaviour that the rest of the app gets for free.
//
// Every overlay in Potroneer is shown and hidden the same way — a `hidden`
// class comes off a container — and that happens from a dozen different call
// sites across main.js and social.js. Rather than teaching each of those sites
// about focus, this module *watches* for the class to change and does the work
// centrally. Adding a new panel later needs no wiring: put it in the list and
// it behaves like the others.
//
// What a dialog owes the keyboard (W3C APG, Dialog (Modal) pattern):
//   • focus moves into it when it opens
//   • Tab cycles inside it and cannot wander out behind it
//   • Escape closes it
//   • focus returns to whatever opened it

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** The tabbable elements inside `root`, in document order, skipping hidden ones. */
function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

let openStack = [];

function topDialog() {
  return openStack[openStack.length - 1] || null;
}

/** Move focus in, remembering where it came from so it can be handed back. */
function activate(dialog) {
  if (openStack.some((entry) => entry.el === dialog)) return;
  const opener = document.activeElement;
  openStack.push({ el: dialog, opener });
  dialog.setAttribute("role", dialog.getAttribute("role") || "dialog");
  dialog.setAttribute("aria-modal", "true");
  // Prefer the first real control; fall back to the dialog itself so focus
  // never stays behind on the page under the overlay.
  const first = focusables(dialog)[0];
  if (first) first.focus();
  else {
    dialog.tabIndex = -1;
    dialog.focus();
  }
}

let fallbackSelector = null;

/**
 * Hand focus back to whatever opened it.
 *
 * The opener is often gone by now: several of these panels are launched from
 * the More menu, which closes itself on the way out, so by the time the dialog
 * shuts the button that opened it is no longer focusable. Dropping focus on the
 * floor there sends the next Tab back to the top of the document, so we fall
 * back to the control that reopens that menu instead.
 */
function deactivate(dialog) {
  const index = openStack.findIndex((entry) => entry.el === dialog);
  if (index === -1) return;
  const [entry] = openStack.splice(index, 1);
  const usable = (el) =>
    el && document.contains(el) && el.offsetParent !== null && !el.disabled;
  if (usable(entry.opener)) {
    entry.opener.focus();
    return;
  }
  const fallback = fallbackSelector && document.querySelector(fallbackSelector);
  if (usable(fallback)) fallback.focus();
}

/**
 * Watch a set of overlays for the `hidden` class going on and off, and give
 * them dialog keyboard behaviour when it does.
 */
export function wireDialogs(ids, { fallbackFocus = null } = {}) {
  fallbackSelector = fallbackFocus;
  const dialogs = ids
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!dialogs.length) return;

  for (const dialog of dialogs) {
    if (!dialog.classList.contains("hidden")) activate(dialog);
    new MutationObserver(() => {
      if (dialog.classList.contains("hidden")) deactivate(dialog);
      else activate(dialog);
    }).observe(dialog, { attributes: true, attributeFilter: ["class"] });
  }

  document.addEventListener(
    "keydown",
    (event) => {
      const top = topDialog();
      if (!top) return;
      if (event.key === "Escape") {
        // Let the panel's own close button do the closing, so whatever
        // bookkeeping it does (saving a form, stopping a preview) still runs.
        const close = top.el.querySelector(
          '[id$="-close"], .cfg-close, .gal-close, .social-close',
        );
        if (close) close.click();
        else top.el.classList.add("hidden");
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(top.el);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at both ends: Tab past the last control returns to the first, and
      // Shift+Tab off the first goes to the last, so the ring is closed.
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      } else if (!top.el.contains(document.activeElement)) {
        first.focus();
        event.preventDefault();
      }
    },
    true,
  );
}

/**
 * The mode tabs, as the APG describes them: one stop in the tab order for the
 * whole set, arrow keys to move between them, and `aria-selected` saying which
 * is current rather than a class only sighted users can see.
 */
export function wireTabs(listSelector, onSelect) {
  const list = document.querySelector(listSelector);
  if (!list) return;
  const tabs = [...list.querySelectorAll(".tab")];
  if (!tabs.length) return;
  list.setAttribute("role", "tablist");
  for (const tab of tabs) {
    tab.setAttribute("role", "tab");
    syncTab(tab);
  }

  list.addEventListener("keydown", (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current === -1) return;
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    let next = null;
    if (step) next = (current + step + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    tabs[next].focus();
    tabs[next].click();
    event.preventDefault();
  });

  // The class is set by selectTab(); mirror it into ARIA and roving tabindex
  // whenever it changes, so the two can never disagree.
  new MutationObserver(() => tabs.forEach(syncTab)).observe(list, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"],
  });
  if (onSelect) onSelect();
}

function syncTab(tab) {
  const active = tab.classList.contains("is-active");
  tab.setAttribute("aria-selected", active ? "true" : "false");
  tab.tabIndex = active ? 0 : -1;
}
