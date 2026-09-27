# Accessibility Checklist (forward guidance for the UI layer)

**No staff or parent UI exists yet** — every phase so far (1–6) delivered
server-side services exercised by automated tests, not pages. This document is
guidance for whoever builds the UI/API layer, not a report on completed work.
Nothing here should be read as "implemented."

Per this project's standing rule: full WCAG conformance cannot be established
by a checklist alone. It requires manual testing with assistive technology
(screen readers, keyboard-only navigation, screen magnification) and ideally a
review by someone with accessibility expertise. Treat the items below as a
starting checklist during implementation and review, not a substitute for that
testing.

## Why this matters for this product specifically

- Parents act via a **secure link with no account** (FR-04/5.3). This is
  usually the *first and only* interaction a parent has with the product, often
  on a phone, sometimes under time pressure (a deadline reminder). A
  confusing or inaccessible consent form directly risks the outcome the whole
  product exists to prevent — a missed or wrongly-recorded consent.
- The spec (Section 11) explicitly requires: responsive parent pages for
  mobile browsers, plain-English forms/notifications, accessible labels,
  keyboard navigation, focus states, and clear error messages; and (Section 16,
  acceptance criterion 14) that core workflows work on mobile and desktop
  browsers.

## Parent-facing consent pages (highest priority)

- [ ] Every form control has a programmatically associated label (`<label for>`
      or `aria-label`), not placeholder-only text.
- [ ] The granted/declined choice is a real form control (radio buttons or
      equivalent), operable by keyboard alone, with a visible focus indicator.
- [ ] Error messages (invalid/expired link, validation failure) are announced
      to assistive technology (e.g. `aria-live`, or focus moved to the error
      summary) and are plain-English, not raw error codes.
- [ ] Confirmation-after-submission is clearly conveyed, not just a colour
      change — include text, not colour alone, to indicate success.
- [ ] Sufficient colour contrast for text and focus indicators (WCAG AA as a
      baseline target).
- [ ] Page works with pinch-zoom and text resizing (no viewport
      `user-scalable=no`).
- [ ] Layout is usable at narrow mobile widths without horizontal scrolling.
- [ ] Language of the page is declared (`<html lang="en-GB">`, already set at
      the app-shell level in `src/app/layout.tsx`).
- [ ] No time-limited interaction on the page itself (the token's expiry is a
      backend concern already handled server-side; the page itself should not
      impose an additional short timeout without warning).

## Staff dashboard & forms

- [ ] All interactive elements (buttons, links, filters, table actions) are
      reachable and operable via keyboard, in a logical tab order.
- [ ] Data tables (consent status, response lists) use semantic table markup
      with header cells (`<th scope="col">`), not div-based layout, so screen
      readers can navigate them.
- [ ] Status/count summaries (invited/consented/declined/outstanding) are
      conveyed as text, not colour-only badges.
- [ ] Form validation errors are associated with their field
      (`aria-describedby`) and summarised for screen reader users.
- [ ] Modal dialogs (e.g. confirm cancellation) trap focus and are dismissible
      via keyboard (Escape), returning focus sensibly on close.

## Email templates

- [ ] Plain-text bodies (already the current template format —
      `src/server/notifications/templates.ts`) are inherently accessible; if
      HTML templates are added later, they must preserve a plain-text
      alternative and avoid conveying meaning by colour alone.

## Process

- [ ] Run automated checks (e.g. axe, Lighthouse) as a first pass during UI
      development — useful for catching missing labels/contrast issues early,
      but not sufficient alone.
- [ ] Manually test the parent consent flow with a screen reader (e.g. NVDA or
      VoiceOver) and keyboard-only navigation before a pilot.
- [ ] Manually test on a real mobile device, not just a resized desktop browser
      window.
