# Prototype IST Design System

## 0. Research Log

- Embedded refs: shortlisted `linear.app`, `vercel`, `sentry` -> picked `taste-skill` + `linear.app` because this prototype needs an operational, precise assessment surface with calm hierarchy rather than decorative marketing.
- Lazyweb: skipped - network tooling not needed because the product direction is already constrained by the written spec and local reference corpus.
- Imagen drafts: skipped - the request is a working prototype site, not an image-first art direction pass.
- Skipped lanes: image-first references - no concrete need; the prototype needs immediate buildable UI and route coverage.

## 1. Atmosphere & Identity

Calm learning workspace. The participant surface borrows the familiar grammar of a modern LMS: course header, module progress, lesson content, and a persistent learning rail. The HR surface behaves like a learning-operations portal with a stable sidebar, compact activity tables, and clear action queues. The signature is a deep academic green paired with a warm amber progress signal on softly tinted paper surfaces.

## 2. Color

### Palette

| Role             | Token                | Light     | Dark      | Usage                                     |
| ---------------- | -------------------- | --------- | --------- | ----------------------------------------- |
| Surface/base     | `--surface-base`     | `#ffffff` | `#101613` | App canvas                                |
| Surface/panel    | `--surface-panel`    | `#ffffff` | `#10192b` | Cards, forms                              |
| Surface/subtle   | `--surface-subtle`   | `#eceee7` | `#17201c` | Secondary panels                          |
| Surface/strong   | `--surface-strong`   | `#dfe5dc` | `#203029` | Highlight bars                            |
| Text/primary     | `--text-primary`     | `#17211d` | `#f0f5f1` | Headings, body                            |
| Text/secondary   | `--text-secondary`   | `#526159` | `#a7b8ae` | Supporting copy                           |
| Text/muted       | `--text-muted`       | `#5f6c64` | `#87998f` | Helper labels                             |
| Border/default   | `--border-default`   | `#d8ddd5` | `#2a3a32` | Standard dividers                         |
| Border/subtle    | `--border-subtle`    | `#e7eae4` | `#202e27` | Soft separations                          |
| Accent/primary   | `--accent-primary`   | `#1f6653` | `#68bda5` | Primary CTA, focus                        |
| Accent/hover     | `--accent-hover`     | `#174f40` | `#83cdb7` | CTA hover                                 |
| Accent/soft      | `--accent-soft`      | `#dcece6` | `#193c31` | Active navigation, informational emphasis |
| Accent/warm      | `--accent-warm`      | `#e7a63f` | `#f2bf6b` | Progress, current module, attention       |
| Accent/warm-soft | `--accent-warm-soft` | `#fbefd9` | `#46361d` | Warm status backgrounds                   |
| Status/success   | `--status-success`   | `#198754` | `#43c087` | Completed/final                           |
| Status/warning   | `--status-warning`   | `#8a5a00` | `#ffbf5b` | Needs review                              |
| Status/error     | `--status-error`     | `#c53f3f` | `#ff7a7a` | Invalid/revoked                           |
| Status/info      | `--status-info`      | `#2f66d0` | `#84a6ff` | Session/tutorial labels                   |

### Rules

- Green is reserved for primary actions, active navigation, and focus states; amber marks progress and the current learning module.
- Charts use the accent ramp plus muted neutrals from this palette only.
- The application currently uses a fixed light appearance so the app canvas stays white regardless of the device color scheme.
- New colors require a semantic role update here first.

## 3. Typography

### Scale

| Level   | Size                         | Weight | Line Height | Tracking  | Usage            |
| ------- | ---------------------------- | ------ | ----------- | --------- | ---------------- |
| Display | `clamp(2.6rem, 4vw, 4.4rem)` | 700    | 1.02        | `-0.04em` | Landing headline |
| H1      | `clamp(1.9rem, 3vw, 2.8rem)` | 700    | 1.08        | `-0.04em` | Screen titles    |
| H2      | `1.7rem`                     | 700    | 1.15        | `-0.02em` | Section headers  |
| H3      | `1.25rem`                    | 650    | 1.3         | `-0.01em` | Card titles      |
| Body/lg | `1.0625rem`                  | 500    | 1.65        | `0`       | Lead copy        |
| Body    | `1rem`                       | 450    | 1.65        | `0`       | Default text     |
| Body/sm | `0.875rem`                   | 500    | 1.55        | `0`       | Metadata         |
| Caption | `0.75rem`                    | 600    | 1.45        | `0.08em`  | Labels           |

### Font Stack

- Primary: `Manrope, system-ui, sans-serif`
- Mono: `IBM Plex Mono, ui-monospace, monospace`

### Rules

- Use mono only for session IDs, access codes, version data, and timing metadata.
- Body text never below `0.875rem`.
- Screen titles should stay within three lines; question prompts may use up to five lines on narrow participant viewports.

## 4. Spacing & Layout

### Base Unit

All spacing follows a 4px base.

| Token        | Value  | Usage                   |
| ------------ | ------ | ----------------------- |
| `--space-1`  | `4px`  | Tight inline spacing    |
| `--space-2`  | `8px`  | Chips, label groups     |
| `--space-3`  | `12px` | Dense form gaps         |
| `--space-4`  | `16px` | Default control padding |
| `--space-5`  | `20px` | Small cards             |
| `--space-6`  | `24px` | Standard cards          |
| `--space-8`  | `32px` | Group spacing           |
| `--space-10` | `40px` | Section spacing         |
| `--space-12` | `48px` | Major section spacing   |
| `--space-16` | `64px` | Page rhythm             |
| `--space-20` | `80px` | Hero breathing room     |

### Grid

- Max content width: `1280px`
- Column system: `12-column`, 24px gutter on desktop, 16px on mobile
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`

### Rules

- Product pages use `min-height: 100dvh`, never `h-screen`.
- HR/Admin pages use a 248px desktop sidebar and a compact horizontal navigation below 1024px.
- Participant lesson pages use a slim course header and a 280px contextual rail on desktop.
- Participant screens prioritize a single primary action region above fold.
- HR screens can use two-column or three-column board layouts, but no nested sidebars.

## 5. Components

### LMS App Frame

- Structure: global header, persistent navigation rail, workspace header, content region
- Variants: participant course, HR operations, super admin
- Spacing: `--space-6` to `--space-12`
- States: default only
- Accessibility: visible landmarks, heading order, skip-link target
- Motion: active navigation background 120ms; no decorative motion

### Course Module Rail

- Structure: course identity, overall progress, ordered module list, support footer
- Variants: upcoming, current, completed, locked
- States: default, active, focus
- Accessibility: current module uses `aria-current`; state always includes icon and text
- Motion: active state background only

### Workspace Panel

- Structure: optional header, body, optional footer actions
- Variants: default, muted, warm, assessment
- Radius: 16px outer, 10-12px inner controls
- Accessibility: semantic `section`, `article`, or `aside` according to content

### Data Card

- Structure: title, optional eyebrow, content body, optional footer
- Variants: default, accent, danger, muted
- Spacing: `--space-5` or `--space-6`
- States: default, hover
- Accessibility: semantic heading or label, contrast-safe borders
- Motion: 160ms translate/border emphasis on hover

### Pill Badge

- Structure: inline label
- Variants: prototype, active, warning, success, error, neutral
- Spacing: `--space-2` horizontal, `--space-1` vertical
- States: default only
- Accessibility: never color-only meaning; always includes text
- Motion: none

### Primary Button

- Structure: text label with optional trailing meta
- Variants: primary, secondary, ghost
- Spacing: height `48px`, horizontal `--space-5`
- States: default, hover, focus, disabled
- Accessibility: focus ring uses `--accent-primary`; 4.5:1 minimum contrast
- Motion: 140ms background and translate transition

### Progress Rail

- Structure: track, fill, summary labels
- Variants: participant, hr status
- Spacing: track height `8px`
- States: default only
- Accessibility: numeric text visible beside bar
- Motion: origin-left scale transition 300ms ease-out

### Answer Option

- Structure: option index, title, hint
- Variants: default, selected
- Spacing: `--space-4`
- States: default, hover, selected, focus
- Accessibility: radio semantics, keyboard reachable, selected state not color-only
- Motion: 150ms border/background/color transition with standard color easing

## 6. Motion & Interaction

| Type     | Duration | Easing                          | Usage                            |
| -------- | -------- | ------------------------------- | -------------------------------- |
| Micro    | `140ms`  | `ease-out`                      | Buttons, pills                   |
| Standard | `180ms`  | `ease-in-out`                   | Card hover, route utility panels |
| Selected | `150ms`  | `cubic-bezier(0.4, 0, 0.2, 1)`  | Selected option                  |
| Progress | `300ms`  | `ease-out`                      | Progress fill                    |

### Rules

- Animate only `transform`, `opacity`, `color`, `border-color`, and `background-color`.
- Respect `prefers-reduced-motion`.
- Timer updates should feel stable, not pulsing or urgent by default.

## 7. Depth & Surface

### Strategy

Mixed: tonal-shift plus restrained shadows.

| Level    | Value                                    | Usage                               |
| -------- | ---------------------------------------- | ----------------------------------- |
| Hairline | `inset 0 0 0 1px rgba(255,255,255,0.05)` | Dark panels                         |
| Subtle   | `0 8px 24px rgba(25, 50, 40, 0.07)`      | Floating navigation and panels      |
| Elevated | `0 18px 44px rgba(25, 50, 40, 0.12)`     | Login and focused assessment panels |

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG target: `2.2 AA`
- All interactive elements expose visible focus rings.
- Timer labels should be assistive-technology friendly without announcing each second.
- Motion remains optional under `prefers-reduced-motion`.

### Accepted Debt

| Item                                 | Location                  | Why accepted                                                                       | Owner / Exit                               |
| ------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| Demo timer is client-side only       | Participant session route | Production timer must be authoritative on server; prototype demonstrates flow only | Replace in production session engine phase |
| HR auth is represented visually only | HR/Admin routes           | Prototype scope excludes real authentication                                       | Replace in production foundation phase     |
