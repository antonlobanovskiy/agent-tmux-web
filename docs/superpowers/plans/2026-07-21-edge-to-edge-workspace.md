# Edge-to-Edge Tmux Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the nested-window appearance so Raw, GUI, Focus, and the empty state are edge-to-edge without output gutters or direct-view frames. Every rendered output view fills `.tmux-output-shell` and aligns with the workspace top, left, and right edges; intentional composer and mobile soft-key sibling rows may occupy the remaining workspace bottom.

**Architecture:** Preserve the existing React view tree and terminal lifecycle. Change only shared workspace/frame CSS, with one source regression test and rendered desktop/mobile verification.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, xterm.js, Playwright

## Global Constraints

- Keep `.tmux-output-shell`; it owns view switching and jump-to-latest positioning.
- Preserve internal xterm, GUI, and Focus content padding.
- Do not change terminal sockets, capture ownership, links, clipboard, uploads, Android, or tmux APIs.
- Raw, GUI, Focus, and no-session output must have no inset outer frame.
- Every rendered output view must fill all four `.tmux-output-shell` edges and align with the workspace top, left, and right edges.
- A view may end above the workspace bottom only where the existing GUI/Focus composer or mobile Raw soft-key sibling row occupies that space. Desktop Raw and no-session output fill the whole workspace when no sibling control row is present.
- Desktop/tablet grid and mobile stack must remain unchanged.
- Do not generate or publish screenshots containing private data.

---

### Task 1: Flatten The Tmux Workspace

**Files:**
- Modify: `src/client/styles.css:204-210, 1221-1266`
- Test: `src/client/__tests__/styles.test.ts:175-226`

**Interfaces:**
- Consumes: existing `.tmux-workspace`, `.tmux-output-shell`, `.tmux-empty-session`, `.tmux-chat`, `.tmux-focus`, and `.tmux-terminal` class structure.
- Produces: an edge-to-edge visual workspace with unchanged DOM and runtime behavior.

- [ ] **Step 1: Write the failing source regression test**

Add this test inside the existing `describe("responsive mobile CSS", ...)` block:

```ts
it("uses the workspace as the only output frame", () => {
  const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
  const workspaceRule = css.match(/(?:^|})\s*\.tmux-workspace\s*\{([^}]*)\}/)?.[1] ?? "";
  const outputFrameRule = css.match(
    /(?:^|})\s*\.tmux-empty-session\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-chat\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-focus\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-terminal\s*\{([^}]*)\}/
  )?.[1] ?? "";

  expect(workspaceRule).toMatch(/padding:\s*0\s*;/);
  expect(outputFrameRule).toMatch(/(?:^|;)\s*border:\s*0\s*(?:;|$)/);
  expect(outputFrameRule).toMatch(/(?:^|;)\s*border-radius:\s*0\s*(?:;|$)/);
  expect(outputFrameRule).toMatch(/(?:^|;)\s*box-shadow:\s*none\s*(?:;|$)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test src/client/__tests__/styles.test.ts
```

Expected: FAIL because `.tmux-workspace` still has `padding: 0 12px 8px`, and direct output views still use a one-pixel border and two-pixel radius.

- [ ] **Step 3: Implement the minimal CSS correction**

Change the workspace rule to:

```css
.tmux-workspace {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: var(--surface-output);
}
```

Replace the direct-output frame rule with:

```css
.tmux-empty-session,
.tmux-output-shell > .tmux-chat,
.tmux-output-shell > .tmux-focus,
.tmux-output-shell > .tmux-terminal {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
```

Remove the now-redundant `border` and `border-radius` declarations from the standalone `.tmux-empty-session` rule only if needed to avoid contradictory source; do not remove its centering, background, or typography.

- [ ] **Step 4: Run focused and full static verification**

Run:

```bash
pnpm test src/client/__tests__/styles.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: focused test passes; 27 test files pass; typecheck and build exit 0. The existing Vite chunk-size advisory may remain.

- [ ] **Step 5: Verify rendered desktop and mobile behavior**

Build and start an isolated loopback server with demo data on an unused port. Using the repository Playwright Chromium fallback, verify at `1440x900` and `390x844`:

```text
Raw: terminal fills all four output-shell edges and aligns with workspace top/left/right; desktop Raw also fills the workspace bottom, while mobile soft keys remain in their sibling row.
GUI: chat fills all four output-shell edges and aligns with workspace top/left/right; the composer remains in its sibling row and message/content padding remains readable.
Focus: focus view fills all four output-shell edges and aligns with workspace top/left/right; the composer remains in its sibling row and internal sections remain padded.
No session: empty state fills all four output-shell and workspace edges and remains centered.
Mobile: workspace has no horizontal overflow; Raw keys and GUI composer stay visible.
Health: no console errors, page errors, failed requests, or HTTP responses >= 400.
```

Record computed bounding boxes for `.tmux-workspace`, `.tmux-output-shell`, and its direct rendered child. Expected output-shell-to-view delta on every side and workspace-to-view delta on top/left/right: `0px` (allow at most one device pixel for rounding). The workspace bottom delta may equal the intentional composer or mobile soft-key sibling row; desktop Raw and no-session workspace-to-view deltas remain `0px` on every side.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- src/client/styles.css src/client/__tests__/styles.test.ts
```

Expected: only the approved spec/plan, CSS, and style test are changed; no whitespace errors or generated media are present. Do not commit unless explicitly requested.
