# Edge-to-Edge Tmux Workspace Design

## Goal

Make Raw, GUI, Focus, and the no-session state edge-to-edge by eliminating workspace gutters and direct-view frames instead of making the output appear as a second window. Every rendered output view fills all four `.tmux-output-shell` edges and aligns with the workspace top, left, and right edges. A view may end above the workspace bottom only when an intentional composer or mobile soft-key sibling row occupies that space; desktop Raw and the no-session state can fill the whole workspace when no such row is present.

## Root Cause

The workspace adds horizontal and bottom gutters, then each rendered view adds another border and radius. Raw adds a third visual layer through xterm's padded canvas. Together these layers make the terminal look like a window nested inside the workspace.

## Design

- Keep the existing React structure and `.tmux-output-shell`; it owns view switching and jump-to-latest positioning.
- Make `.tmux-workspace` the only visual container by removing its output gutters.
- Define edge-to-edge at the output boundary: each rendered view fills all four `.tmux-output-shell` edges and aligns with the workspace top, left, and right edges. Preserve the workspace bottom for an intentional composer or mobile soft-key sibling row when present.
- Remove the border, radius, and whole-panel focus ring from direct Raw, GUI, Focus, and empty-state children.
- Preserve modest content padding inside xterm, GUI messages, and Focus content so text does not touch the viewport edge.
- Let mobile soft keys and the GUI composer span the workspace without horizontal overflow.
- Preserve the desktop/tablet grid, mobile stack, toolbar, scrolling, socket lifecycle, capture behavior, links, selection copying, and view switching.

## Error Handling And Data Flow

No data flow or error handling changes are needed. This is a CSS-only presentation correction; terminal and capture state continue through the current components and effects.

## Verification

- Add a source-level regression test that requires zero workspace gutters and no frame styling on direct output views.
- Verify Raw, GUI, Focus, and no-session rendering at desktop and mobile widths.
- Confirm each output view fills `.tmux-output-shell`, aligns with the workspace top, left, and right edges, and only ends above the workspace bottom for a preserved composer or mobile soft-key row. Confirm desktop Raw and the no-session state fill the whole workspace, xterm still fits and scrolls, GUI/Focus retain readable internal spacing, and mobile controls do not overflow.
- Run the full test suite, typecheck, and production build.

## Out Of Scope

- View-state or terminal lifecycle changes.
- Toolbar, control-rail, theme, or typography redesign.
- Changes to upload, Android bridge, clipboard, links, notifications, or tmux APIs.
