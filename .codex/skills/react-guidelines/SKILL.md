---
name: react-guidelines
description: Best practices for React development. Use when building React components, managing state, creating UI layouts, or working with JSX/TSX files.
metadata:
  short-description: React component and UI development guidelines
---

# React Guidelines

## Responsive design best practices

- **Mobile-First Development**: Start with the mobile layout and progressively enhance for larger screens.
- **Standard Breakpoints**: Use a consistent set of breakpoints across the app (mobile/tablet/desktop), and document them.
- **Design for Containers, Not Just Viewports**: Prefer layouts that adapt to available space (sidebars, cards, modals), not only screen width.
- **Fluid Layouts**: Use flexible grids and containers (percentages, flex, grid) that adapt naturally.
- **Relative Units**: Prefer rem/em for typography and spacing; avoid hard-coded pixel sizes except for hairlines/borders when needed.
- **Responsive Media**: Ensure images/video scale correctly (`max-width: 100%`, proper aspect ratios) and don’t overflow containers.
- **Content Priority**: Show the most important content first on smaller screens; defer or collapse secondary content.
- **Touch-Friendly Design**: Ensure tap targets are large enough (≈44x44px) and spaced to avoid accidental taps.
- **Don’t Rely on Hover**: Any hover-only affordance must have an equivalent for touch/keyboard users.
- **Readable Typography**: Maintain readable font sizes, line height, and line length across breakpoints without requiring zoom.
- **Safe Areas & Insets**: Account for notches/home indicators (safe-area insets) on modern mobile devices when relevant.
- **Performance on Mobile**: Optimize images/assets (responsive sizes, lazy-loading where appropriate); avoid heavy layout thrashing and large JS on initial load.
- **Test Across Devices**: Verify key screens across multiple widths and orientations; include edge cases (very small phones, large monitors, zoomed text).
- **Respect User Preferences**: Support reduced motion and high-contrast modes where applicable; avoid layout that breaks when text size is increased.


---

## UI component best practices

- **Single Responsibility**: Each component should have one clear purpose and do it well.
- **Composability First**: Prefer building UIs by composing small components rather than adding more flags/props to one “mega component.”
- **Prefer Composition Over Prop Explosion**: If a component needs many props (especially booleans like `showX`, `enableY`, `isZ`), refactor to composition.
  - Split into smaller components, or provide subcomponents/slots (e.g., `Card.Header`, `Card.Body`, `Card.Footer`).
  - Prefer `children`/slots over `renderFoo`, `fooComponent`, or `fooClassName` props unless there’s a strong reason.
- **Avoid Too Many Boolean Props**: Multiple boolean props usually indicate multiple responsibilities. Replace with:
  - A single `variant`/`size`/`intent` prop (constrained set of options), and/or
  - Composition (optional child sections), and/or
  - Separate components for distinct behaviors.
- **Clear Interface**: Define explicit props with sensible defaults; keep prop names predictable and consistent.
- **Encapsulation**: Hide internal implementation details; expose only what consumers need (props/events/slots).
- **Consistent Naming**: Use descriptive names for components and props; follow team conventions.
- **State Management**: Keep state local by default; lift it only when multiple components must share it.
- **Controlled vs Uncontrolled**: Be consistent per component; support controlled usage when the state must be managed by parents.
- **Loading/Empty/Error States**: Components that depend on async data should define these states explicitly.
- **Accessibility**: Use semantic HTML; ensure keyboard navigation, focus management, and labels. Use ARIA only when needed.
- **Performance by Default**: Avoid unnecessary re-renders (stable keys; memoization when it matters; avoid creating new objects/functions in hot paths).
- **Documentation**: Document usage, props, examples, and edge cases (controlled/uncontrolled, async states, accessibility notes).

### Prop explosion warning signs (refactor triggers)

- More than ~8–10 props, or more than ~3 boolean flags.
- Props that only make sense in certain combinations (many conditional branches).
- Many style props (`headerClassName`, `bodyClassName`, `footerClassName`, etc.) to customize internal parts.
- “God components” that handle layout + data fetching + formatting + interactions.

### Preferred composable patterns

- **Compound components**: `Menu`, `Menu.Item`, `Menu.Separator`
- **Slot/children sections**: `Modal` with `ModalHeader`, `ModalBody`, `ModalFooter`
- **Presentational + container split**: `UserCard` (UI) + `UserCardContainer` (data/state)
- **Variant props for styling only**: `variant="primary" | "secondary"` instead of many flags

