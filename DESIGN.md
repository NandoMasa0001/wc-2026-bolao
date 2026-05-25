# DESIGN.md — World Cup Prediction League

> Visual identity for the 2026 World Cup prediction site, inspired by the
> **2014 FIFA World Cup Brazil** look: vibrant, tropical, celebratory, built
> around Brazil's green / yellow / blue.
>
> **Golden rule for the build:** every colour, font, space, radius, shadow and
> motion value below must live in **one tokens file** (`src/styles/tokens.css`).
> Components reference tokens only. **Never hardcode a hex value, pixel size or
> font name inside a component.** If a value is not in this file, add it here
> first, then use it.

---

## 1. Design principles

1. **Festive, not corporate.** This is a game among friends. Bright colour
   blocks, rounded shapes, confident type. It should feel like a party.
2. **Mobile-first.** Most friends will open this on a phone. Design every
   screen for a 360–430px wide viewport first, then let it scale up.
3. **Glanceable.** A player should see their rank, the next match to predict,
   and whether a match is live in under two seconds.
4. **Consistency over creativity.** Reuse the components below. Don't invent
   new colours or one-off spacings.

---

## 2. Colour tokens

Base palette taken from the official 2014 FIFA World Cup Brazil identity.

```css
:root {
  /* ---- Brand (2014 World Cup palette) ---- */
  --c-blue:        #003469;  /* Ateneo Blue  — primary, headers, nav      */
  --c-green:       #336F1B;  /* Palm Green   — secondary                  */
  --c-lime:        #ABCB2D;  /* Juicy Lime   — success, "advanced" state  */
  --c-gold:        #FDD301;  /* Gold         — primary CTA, highlights    */
  --c-orange:      #F79516;  /* American Orange — accents, warnings       */
  --c-red:         #D8131A;  /* Rose Madder  — live matches, danger       */

  /* ---- Brand tints / shades (for hovers, fills, borders) ---- */
  --c-blue-dark:   #002247;
  --c-blue-soft:   #E2E9F1;  /* pale blue fill                            */
  --c-gold-dark:   #E4BD00;  /* gold button hover                         */
  --c-lime-soft:   #EEF3D5;
  --c-red-soft:    #FBE3E4;

  /* ---- Neutrals (warm, slightly cream — tropical paper feel) ---- */
  --c-ink:         #1A2230;  /* primary text                              */
  --c-stone:       #5F6470;  /* secondary / muted text                    */
  --c-mist:        #D9D6CB;  /* borders, dividers                         */
  --c-cloud:       #F4F1E8;  /* app background (warm off-white)           */
  --c-white:       #FFFFFF;  /* cards, surfaces                           */

  /* ---- Semantic aliases (use these in components) ---- */
  --bg-app:        var(--c-cloud);
  --bg-surface:    var(--c-white);
  --bg-header:     var(--c-blue);
  --text-primary:  var(--c-ink);
  --text-muted:    var(--c-stone);
  --text-on-dark:  var(--c-white);
  --border:        var(--c-mist);

  --action:        var(--c-gold);     /* primary buttons                  */
  --action-text:   var(--c-ink);      /* text on gold buttons             */
  --action-hover:  var(--c-gold-dark);

  --success:       var(--c-lime);     /* team advanced, correct pick      */
  --warning:       var(--c-orange);   /* deadline soon, partial points    */
  --danger:        var(--c-red);      /* live match, errors               */
  --info:          var(--c-blue);
}
```

### Usage rules
- **App background** is always `--bg-app` (warm cream), never pure white.
- **Cards / surfaces** sit on top in `--bg-surface` (white) with a soft shadow.
- **The header / top nav** is `--c-blue` with white text — the anchor of the brand.
- **Gold is the action colour.** Primary buttons, the "Confirm prediction" CTA,
  the points pill — all gold. Use it sparingly so it stays an event.
- **Red means live.** Only a match currently being played uses red. Don't use
  red for anything else except genuine errors.
- **Lime means success** (a team you predicted has advanced, a correct pick).
- Accent colours (green, orange) are for charts, group colour-coding, and
  decorative banding — not for text.

### Contrast / accessibility
- Body text: `--c-ink` on `--c-cloud` / `--c-white` — passes AA.
- Never put white text on gold or lime (fails contrast). On gold use `--c-ink`.
- White text is only for `--c-blue`, `--c-green`, `--c-red` backgrounds.

---

## 3. Typography

Two free Google Fonts. Load them in `index.html`.

```css
:root {
  --font-display: 'Poppins', system-ui, sans-serif;  /* headings, scores */
  --font-body:    'Inter', system-ui, sans-serif;    /* everything else  */

  /* Type scale (mobile-first; rem assumes 16px root) */
  --fs-display:  2rem;     /* 32px — page titles, big score numbers */
  --fs-h1:       1.5rem;   /* 24px */
  --fs-h2:       1.25rem;  /* 20px */
  --fs-h3:       1.0625rem;/* 17px */
  --fs-body:     1rem;     /* 16px — never smaller for body text    */
  --fs-small:    0.875rem; /* 14px — captions, metadata             */
  --fs-tiny:     0.75rem;  /* 12px — pills, labels only             */

  --fw-regular:  400;
  --fw-medium:   500;
  --fw-semibold: 600;
  --fw-bold:     700;
  --fw-black:    800;      /* display headings, score numbers       */

  --lh-tight:    1.15;     /* headings                              */
  --lh-normal:   1.5;      /* body                                  */
}
```

- **Headings & score numbers:** `--font-display`, weight 700–800.
- **Body, buttons, inputs:** `--font-body`.
- **Score numbers** (e.g. `2 – 1`) use `--font-display` weight 800 and
  `font-variant-numeric: tabular-nums` so digits line up.
- Desktop (≥768px): bump `--fs-display` to `2.5rem` and `--fs-h1` to `1.75rem`
  via a media query — done once, in the tokens file.

---

## 4. Spacing, radius, shadow, motion

```css
:root {
  /* Spacing — 4px base scale */
  --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
  --sp-5: 24px;  --sp-6: 32px;  --sp-7: 48px;  --sp-8: 64px;

  /* Radius — generous & rounded (the 2014 look is friendly, not sharp) */
  --r-sm:   8px;
  --r-md:   12px;
  --r-lg:   16px;
  --r-xl:   24px;
  --r-pill: 999px;

  /* Shadows — soft, low, warm */
  --shadow-1: 0 1px 2px rgba(26, 34, 48, 0.06);
  --shadow-2: 0 4px 12px rgba(26, 34, 48, 0.10);
  --shadow-3: 0 12px 28px rgba(26, 34, 48, 0.16);

  /* Motion */
  --ease:        cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast:    120ms;   /* hover, tap feedback        */
  --dur-normal:  220ms;   /* entrances, expand/collapse */

  /* Layout */
  --content-max: 720px;   /* the app is a single centred column */
}
```

- **Page padding:** `--sp-4` (16px) on mobile, `--sp-6` on desktop.
- **Card padding:** `--sp-4` to `--sp-5`.
- **Gap between cards in a list:** `--sp-3`.
- The whole app is a single centred column capped at `--content-max`.
- Respect `prefers-reduced-motion`: disable non-essential transitions.

---

## 5. Decorative motifs

The 2014 look had colourful, festive banding. Use sparingly:

- **Colour band:** a thin (4px) horizontal bar that cycles
  blue → green → lime → gold → orange → red. Use it at the top of the header
  and as a divider above the leaderboard. It's the signature flourish.
- **Group colour-coding:** the 12 groups (A–L) each get a colour drawn from the
  brand palette + tints, used as a small dot/label so groups are scannable.
- Keep the rest clean: white cards, cream background, lots of breathing room.
  The colour comes from content (flags, the band, gold CTAs), not from
  decorating every surface.

---

## 6. Core components

All components are mobile-first, full-width within the column, min tap target
**44×44px**.

### Button
| Variant | Use when | Style |
|---|---|---|
| Primary | Main action ("Confirm prediction", "Save") | `--action` bg, `--action-text`, `--r-pill`, bold |
| Secondary | Supporting action | transparent bg, `2px solid --c-blue`, `--c-blue` text |
| Ghost | Low-emphasis ("Cancel", "Skip match") | no border, `--text-muted` text |
| Danger | Destructive (admin only) | `--danger` bg, white text |

States: default / hover (`--action-hover` or 8% darken) / active (scale 0.97) /
disabled (50% opacity, no pointer) / loading (spinner, label hidden).
Keyboard: focusable, visible focus ring (`3px` `--c-blue` outline, 2px offset).

### Card
White surface, `--r-lg`, `--shadow-1`, padding `--sp-4`. The base container for
matches, leaderboard rows, prediction sections. Hover (desktop): lift to
`--shadow-2`.

### MatchCard
The most important component. Shows: stage/group label, both teams (flag +
name + 3-letter code), kickoff time, and the prediction state.
- **Open for prediction:** two score steppers (see below) + Save.
- **Predicted:** shows the player's pick, an "edit" affordance, time until lock.
- **Locked / live:** steppers disabled; a red **LIVE** pill if in progress.
- **Finished:** shows actual score, the player's pick, and points earned
  as a gold pill (e.g. `+5`, `+3`, `0`).

### ScoreStepper
A number input for goals: a `–` button, the number (display font, 800,
tabular), a `+` button. Range 0–20. Big tap targets. Used twice per MatchCard.

### Pill / Badge
Small rounded label, `--fs-tiny`, uppercase, `--r-pill`.
- `LIVE` — red bg, white text.
- `LOCKED` — stone bg, white text.
- `+5` points — gold bg, ink text.
- Group label `GROUP F` — group's colour-coded.

### TeamChip
Flag (rounded 4px) + team name (+ optional 3-letter code). Reused everywhere
teams appear. A `selected` state (lime ring) for the advancement picker.

### LeaderboardRow
Rank number (display font, 800), player name, points total (gold pill).
Top 3 get a subtle gold/ silver/ bronze left border. The current player's row
is highlighted with `--c-blue-soft`.

### Tabs (bottom navigation on mobile)
Fixed bottom bar, 4–5 items: **Matches · Standings · My Predictions ·
Leaderboard · (Admin)**. Active tab uses `--c-blue` icon+label, inactive uses
`--text-muted`. Min 48px tall + safe-area inset.

### GroupTable
Standings grid for one group: Pos, Team, P, W, D, L, GF, GA, GD, Pts. The top
2 rows tinted `--c-lime-soft` (advancing), 3rd row `--c-gold` tint (in
contention for best-third). Used for both real standings and the player's
**predicted** standings.

### Toast
Transient confirmation ("Prediction saved"), top of screen, auto-dismiss 3s,
`--shadow-3`. Success uses lime accent, error uses red.

### Modal / Sheet
On mobile, slides up from the bottom (a sheet); on desktop, a centred dialog.
Used for confirm-advancement, the awards form, and the end-of-tournament vote.
Dismissible by backdrop tap / Escape; focus trapped while open.

### EmptyState
Friendly illustration-free message + a CTA. E.g. "No matches to predict right
now — the Round of 32 unlocks once groups finish."

---

## 7. Accessibility checklist (WCAG 2.1 AA)

- Colour is never the only signal: advancing teams get a ✓ / label, not just
  lime; live matches get the word "LIVE", not just red.
- All interactive elements ≥44×44px, visible focus ring, reachable by keyboard.
- Score steppers are real `<input type="number">` or have proper ARIA
  (`role="spinbutton"`, `aria-valuenow/min/max`).
- Body text never below 16px; contrast ratio ≥4.5:1 for text.
- Honour `prefers-reduced-motion`.
- Every flag image has an `alt` with the country name.

---

## 8. Handing this to Claude Code

1. The **first build step** is to create `src/styles/tokens.css` containing
   every `:root` block above, and import it once at the app entry point.
2. Add a project rule (it's also in `CLAUDE.md`): *no raw hex, px font sizes,
   or font names in components — tokens only.*
3. Build the components in section 6 as a small shared library before building
   pages, so every screen is assembled from the same parts.
4. Optionally drop the six 2014 palette swatches into `/design-reference/` as a
   visual anchor.
