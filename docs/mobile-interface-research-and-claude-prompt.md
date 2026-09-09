# Potroneer mobile interface research and implementation brief

## Executive direction

Potroneer already has the right product idea for mobile: a calm, tactile 3D terrarium studio with direct manipulation, a focus-build mode, a collapsible tray, progressive disclosure, bilingual copy, and comfort settings. The current phone layout still inherits too much of the desktop composition, though: a permanent left tray, a right rail, top tabs, and several floating panels compete for a very small canvas.

The mobile direction should be a **jar-first editor**:

- Keep the terrarium large and visually dominant.
- Put the most frequent actions in a bottom thumb dock with generous hit areas.
- Move the material tray, theme picker, progress, social, customizer, and comfort settings into one-at-a-time bottom sheets or modal sheets.
- Keep drag, pinch, and tap interactions, but make every drag-only action possible through a tap-based alternative.
- Treat Bengali/English, text scaling, safe areas, reduced motion, and high contrast as first-class layout constraints.

This is not a request to redesign Potroneer’s desktop interface or rewrite the Three.js scene. It is a responsive mobile interaction layer around the existing product.

## Evidence base

### Touch comfort

The practical target should be 48 CSS pixels for primary mobile controls, with at least 8 pixels of separation. Material’s accessibility guidance uses a 48dp touch target and explains that the visual icon can remain smaller inside the larger target ([Material accessibility](https://m1.material.io/usability/accessibility.html)). Apple recommends 44×44pt for frequently used controls and specifically advises placing game controls in comfortable thumb locations and respecting safe areas ([Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Apple game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)).

WCAG 2.2 sets a 24×24 CSS-pixel minimum target size at Level AA, with a 44×44 enhanced target size at Level AAA. More importantly for Potroneer, it explains why larger targets and spacing reduce accidental activation for people with tremors, low precision, large fingers, or a device that is moving ([WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)). Therefore, 24px is a compliance floor, not a comfortable design target.

### Layout and reach

Apple’s game guidance recommends maximizing the controllable surface for movement/camera input, keeping frequently used controls near the thumb, and putting secondary controls near the top. That maps well to Potroneer: the jar should occupy the center, primary build actions should live at the bottom, and preferences or account actions should open from a compact top control.

On phones, a persistent 150px left tray plus a 148px right rail leaves too little room for the jar and forces controls into narrow columns. A sheet lets the user intentionally open the shelf, make a choice, and return to the uninterrupted terrarium.

### Safe areas and mobile browser chrome

Fixed bottom controls must account for notches, rounded corners, home indicators, and browser overlays. CSS environment variables such as `env(safe-area-inset-bottom)` provide the safe inset rectangle for this purpose ([MDN `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)).

Avoid relying on `100vh` for sheet heights. Mobile browser UI changes the visible viewport; `svh`, `lvh`, and `dvh` exist specifically to distinguish stable small, large, and dynamic viewport sizes ([web.dev viewport units](https://web.dev/blog/viewport-units)). Sheets should use a bounded `dvh` height and remain internally scrollable.

### Gesture accessibility

Potroneer uses `touch-action: none` on the full canvas, custom pointer events, pinch zoom, rotation, item dragging, and drag-to-place behavior. That is appropriate for a 3D editor, but it has a trade-off: MDN notes that `touch-action: none` can inhibit browser zoom, which may prevent people with low vision from enlarging content ([MDN `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)). Keep custom canvas gestures, but provide visible alternate controls for zoom, center, camera lock, and placement; do not make a critical action available only through dragging.

WCAG 2.2 also requires that functionality using dragging be available through a single-pointer alternative unless dragging is essential, and recommends that pointer activation not commit too early when an undo/abort path is possible ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). For Potroneer, “select a material, then tap the jar” should always work even if “drag from the tray into the jar” remains available.

### Motion and visual comfort

Potroneer already has strong foundations: `prefers-reduced-motion`, in-app reduced motion, reduced transparency, high contrast, text scale, sound controls, a calm camera action, and a skippable intro. Keep those systems. W3C documents `prefers-reduced-motion` as a technique for suppressing interaction-triggered animation because motion can distract or cause discomfort ([W3C C39](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html)). Apple similarly recommends purposeful, brief, optional motion and alternate feedback ([Apple motion](https://developer.apple.com/design/human-interface-guidelines/motion)).

Do not use auto-spin, parallax, large peripheral movement, or bouncing sheets as the only way to communicate state. The jar can remain alive by default, but reduced-motion users should receive a still camera and concise visual state changes.

### Text, contrast, and focus

The existing `--text-scale` setting should remain capable of reaching 200%. WCAG requires text to be resizable to 200% without loss of content or functionality ([WCAG resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)). Do not solve narrow layouts by shrinking text or hiding labels. Let sheet content scroll, let Bengali labels wrap, and keep primary actions legible.

Use at least 4.5:1 contrast for normal text and 3:1 for large text ([WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)). Focus must remain visible when a sheet, dock, or sticky footer is present; WCAG 2.2 explicitly calls out sticky headers and footers as common causes of obscured focus ([WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)). The existing `src/a11y.js` dialog and tab wiring should be preserved and extended rather than bypassed.

## Project-specific audit

### Existing strengths to preserve

- `src/scene.js` already supports pointer capture, rotation, pinch zoom, camera locking, object dragging, and touch-specific placement behavior.
- `src/main.js` already has focus-build mode, a temporary tray, radial quick actions, undo/redo, camera mode, a comfort modal, and persistent comfort preferences.
- `src/intro.js` already skips or simplifies the intro for reduced-motion users.
- `src/style.css` already uses safe-area padding in the focus tray and has reduced-motion, reduced-transparency, high-contrast, and scalable text hooks.
- `src/a11y.js` already provides dialog focus handling and tab semantics.
- The renderer already caps device pixel ratio on phones, which is important for a responsive 3D scene.

### Main mobile risks

1. At `max-width: 700px`, the layout still keeps a `150px` tray and a `148px` right rail. On a 360–390px phone this leaves a narrow visual corridor for the jar and makes the primary creative surface feel secondary.
2. Several controls are too small for comfortable touch: the HUD utility button is `28×24px`, tray add/remove buttons are `16×16px`, category/build controls are about `34px` high, and many icon buttons are visually dense.
3. The right rail is merely compressed to icons on smaller widths. Icons without persistent labels increase recognition effort, particularly in Bengali and for infrequent actions.
4. Panels such as theme, customizer, photo, social, and progress are positioned as desktop-style floating panels. On a phone they should become a consistent sheet/modal system with a clear close action and internal scrolling.
5. The current canvas intentionally owns touch gestures. This must remain, but critical operations need visible non-drag alternatives and camera controls must not be hidden behind the canvas.
6. `overflow: hidden` and fixed-position overlays increase the risk of clipped content when the user increases text size. Mobile sheets need their own scroll container and safe focus scrolling.

## Recommended mobile information architecture

### Default phone workspace

- Full-bleed 3D stage.
- Small top status cluster: level/progress, a compact menu button, and an optional sound state; no permanent brand card or dense rail.
- Bottom dock with four or five controls: `Tray`, current tool/action, `Undo`, `Camera`, and `More` (exact labels follow the existing i18n system). Every control has a minimum 48×48px hit area.
- The active material/tool is always visible as a text-plus-icon “current selection” label, not only an emoji.
- A short hint appears above the dock and never covers the jar’s active work area.

### Material tray sheet

- Opens from the bottom dock or the existing focus tray action.
- Uses a grab handle, a clear title, category tabs or a compact category selector, search, and a horizontally scrollable or two-column item grid.
- Each item card has a 48px-or-larger activation region, a visible selected state, lock/favorite state, habitat hint, and a tap-to-select action.
- Drag-to-place stays as an optional enhancement. Tap item → tap inside jar is the reliable default.
- Selecting an item closes the sheet and restores the build dock so the user’s next action is obvious.

### Settings and secondary sheets

Theme, jar customizer, item adjuster, photo mode controls, comfort, achievements, social, and co-op should use a shared sheet/modal pattern:

- one active sheet at a time;
- `max-height: min(82dvh, 680px)`;
- `overflow: auto` on the content region;
- sticky header with title and 48px close button;
- safe-area-aware bottom padding;
- focus moved into the sheet and returned to the opener;
- Escape/backdrop close where safe;
- no destructive action as an icon-only control;
- primary action remains reachable after 200% text scaling.

### Focus Build on mobile

Make Focus Build the default mobile editing mode or offer it as the first prominent action. It already expresses the right mental model: the jar owns the screen and the tray appears only when needed. Keep the dock at the bottom, keep camera lock/center and undo/redo visible, and make the sheet handle large enough to find without precision.

## Copy-ready Claude implementation prompt

The prompt below is intentionally explicit about scope, constraints, and verification so Claude improves the mobile interface without undoing the project’s existing behavior.

---

You are a senior frontend engineer and mobile interaction/accessibility specialist. Implement a polished, comfortable mobile interface for this existing Potroneer project.

### Project context

Potroneer is a bilingual Bengali/English cozy 3D terrarium builder built with Vite, vanilla JavaScript, Three.js, and CSS. The current project already supports:

- direct jar placement by tap;
- drag-to-rotate, pinch zoom, and two-finger camera movement;
- dragging placed decorations;
- drag-from-tray placement;
- sculpt and paint modes;
- Focus Build mode;
- undo/redo, photo mode, themes, social/community, co-op, progression, and comfort settings;
- reduced motion, reduced transparency, high contrast, text scaling, sound controls, and a skippable intro;
- dialog/tab accessibility helpers in `src/a11y.js`.

Read the existing code before editing. Preserve the current desktop experience and the Three.js scene/model/state behavior. Do not replace the app with a static mockup, do not remove existing features, and do not rewrite the renderer unless a small change is required for mobile interaction.

### Main goal

On phones, make the interface feel like a calm, full-bleed terrarium studio: the jar is the primary surface, the controls are reachable with one hand, and complex tools appear only when requested.

### Mobile layout to implement

1. Create a true phone layout for widths up to 700px and a compact-landscape layout for short landscape heights. Do not compress the desktop left tray and right rail into narrow columns.
2. On phones, hide the permanent desktop rail and permanent left tray. Replace them with:
   - a small safe-area-aware top status/menu area;
   - a bottom thumb dock with 4–5 high-frequency actions;
   - bottom sheets for the material tray and secondary panels.
3. Keep Focus Build as the primary mobile editing workspace or make it the most prominent entry action. The jar must remain visually dominant and unobstructed when no sheet is open.
4. Use CSS logical properties (`inset-inline`, `margin-inline`, `padding-block`, etc.) where practical so the layout remains robust for both languages.
5. Use `100dvh`/`100svh` appropriately for mobile viewport behavior and `env(safe-area-inset-top/right/bottom/left)` for fixed controls and sheets. Never place a bottom action row flush against the home indicator.

### Touch and interaction requirements

1. Every primary mobile control must have a minimum 48×48px hit area, with at least 8px separation from adjacent controls. Small visual icons may remain smaller inside that area.
2. Expand tiny existing controls such as favorites, tray add/remove, close, sound, camera, and reset into comfortable hitboxes without making the visual design clumsy.
3. Keep the existing custom canvas gestures: one-finger rotate, two-finger pinch/rotate, camera lock, object drag, and touch placement behavior.
4. Add visible alternate controls for camera center, zoom in/out or zoom reset, and camera lock. Do not make important functionality drag-only.
5. Make material placement work reliably with: select material → tap jar. Keep drag-from-tray as an optional shortcut.
6. Prevent accidental camera rotation while the user is interacting with buttons, sheets, sliders, inputs, or scrollable content. Preserve pointer capture and cancellation behavior.
7. Give buttons clear pressed/selected/disabled states with visual feedback and accessible ARIA state. Do not communicate state by color alone.
8. Keep undo visible in the mobile dock during editing. Any action that can be hard to reverse must either be undoable or have a clear cancellation path.

### Sheet system

Create or refactor to one reusable mobile sheet pattern for the material tray, theme picker, jar customizer, item adjuster, photo controls, progress, comfort, achievements, social, and co-op.

- one active sheet at a time;
- maximum height based on `dvh`, capped so the jar is not permanently lost;
- internal scrolling, never page-level horizontal scrolling;
- sticky header with a readable title and a minimum 48px close button;
- grab handle and backdrop dismissal where safe;
- safe-area-aware bottom padding;
- focus moves into the sheet, Escape/backdrop closes it when appropriate, and focus returns to the opener;
- preserve and extend `src/a11y.js` rather than bypassing it;
- ensure focused controls are not completely hidden behind the dock or sheet.

For the material tray sheet, keep category selection, search, item cards, lock/favorite/habitat states, and the current selection label. Use a scrollable two-column grid or compact horizontal carousel that remains usable at 320px width and with Bengali labels.

### Comfort and accessibility requirements

1. Preserve `prefers-reduced-motion` and the in-app reduced-motion setting. Disable auto-spin, unnecessary parallax, bouncing sheets, and nonessential movement when enabled. Keep concise visual feedback.
2. Preserve reduced transparency, high contrast, sound, volume, and text-scale settings.
3. Test the interface at 200% text size. Text must wrap or cause a sheet to scroll; never clip labels, overlap controls, or silently hide primary functionality.
4. Maintain at least 4.5:1 contrast for normal text and provide visible focus rings. Keep Bengali and English labels readable without relying on hover or tooltips.
5. Add or correct `aria-label`, `aria-expanded`, `aria-controls`, `aria-pressed`, dialog roles, live regions, and tab semantics where needed.
6. Keep the intro skippable and reduced-motion aware.
7. Do not block browser/page accessibility with a global gesture rule. The custom `touch-action` behavior may remain on the 3D canvas because it owns editor gestures, but DOM controls and text must remain zoomable and usable; provide explicit canvas zoom controls.

### Visual direction

Keep Potroneer’s cozy, tactile, themed visual language. Use the existing theme tokens, Bengali font, accent colors, soft panels, and physical keycap feedback. On mobile, prioritize calm hierarchy over decoration:

- large jar;
- one clear current action;
- one obvious way to open the tray;
- one obvious way to undo;
- small, quiet status text;
- no dense icon wall or permanent desktop chrome.

### Verification checklist

After implementation, run the production build and manually verify at minimum:

- 390×844 portrait;
- 430×932 portrait;
- 360×800 Android-sized portrait;
- 320px-wide viewport;
- 844×390 short landscape;
- Bengali and English;
- reduced motion enabled;
- high contrast enabled;
- text scale at 200%;
- sheet open with focus inside;
- material select → jar tap placement;
- one-finger jar rotation;
- two-finger pinch zoom/rotate;
- object drag and undo;
- photo mode and camera controls;
- theme/customizer/social/comfort sheets;
- no horizontal page overflow, clipped labels, controls under the home indicator, or controls hidden behind a sheet.

Finish by summarizing the files changed, the mobile interaction model, and any remaining limitations. Do not stop at a visual CSS pass: verify the actual interactions and existing features.

---

## Sources

1. W3C, [Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
2. W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/).
3. W3C, [Understanding SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
4. W3C, [Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).
5. W3C, [Understanding SC 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).
6. W3C, [Technique C39: Using `prefers-reduced-motion`](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html).
7. Apple, [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
8. Apple, [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls).
9. Apple, [Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
10. Material Design, [Accessibility](https://m1.material.io/usability/accessibility.html).
11. MDN, [`env()` CSS function](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env).
12. web.dev, [The large, small, and dynamic viewport units](https://web.dev/blog/viewport-units).
13. MDN, [`touch-action` CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
