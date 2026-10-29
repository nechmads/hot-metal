---
version: alpha
name: Hot Metal dashboard
description: Existing dashboard conventions, reconstructed for assistant connection UI.
colors:
  primary: '#d97706'
  accentHover: '#b45309'
  accentLight: '#fef3c7'
  textPrimary: '#0a0a0a'
  textMuted: '#6b7280'
  background: '#ffffff'
  card: '#f5f5f5'
  border: '#e5e7eb'
typography:
  body:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.428571
rounded:
  control: 8px
  panel: 12px
spacing:
  small: 8px
  medium: 16px
  panel: 24px
components:
  primaryButton:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.background}'
    rounded: '{rounded.control}'
  connectionPanel:
    textColor: '{colors.textPrimary}'
    rounded: '{rounded.panel}'
---

## Overview

Hot Metal helps writers manage publications and drafts. The dashboard uses compact type, neutral surfaces and amber actions. Assistant consent should make the account, permissions and publication selection easy to inspect before allowing access. These conventions describe the existing web dashboard; publication templates and the public marketing pages retain their own visual systems.

## Colors

The light palette above maps to the Hot Metal CSS variables in `apps/web/src/styles.css`. Reuse semantic variables and existing dark variants instead of introducing another palette. Amber identifies actions and focus. Red identifies revocation. Status text accompanies status color. Preserve readable muted text in dark mode; the assistant screens use the existing gray-400 utility where necessary.

## Typography

Use the existing Inter/system stack and hierarchy. The dashboard overrides Tailwind text-base to 14px, text-sm to 12px and text-xs to 10px. Keep headings stronger than body copy without all-caps permission labels. Long assistant names, redirect hosts and publication titles wrap as literal text.

## Layout

Settings extends the existing vertical sections. Consent uses a single column with a 576px maximum width and 16px mobile gutters. Group related permission choices; separate action consent, publication access and social outlets. Preserve a visible cancel action even when no publications exist. Use the existing spacing rhythm rather than ornamental sections.

## Elevation & Depth

Use borders and neutral tonal surfaces for hierarchy. Reuse the existing Modal for temporary permission editing and revocation confirmation. Reserve its overlay for active decisions; avoid decorative shadows or gradients on connection rows.

## Shapes

Controls use 8px rounding and connection panels use 12px rounding. Status pills are small supporting labels. Assistant controls provide a minimum 44px touch target.

## Components

Reuse Loader, Modal, toast feedback and existing settings patterns. Consent starts with read permission, with write, publish and social outlet choices explicit. Pending, connected and revoked states have text labels. Loading, error, empty, expired and concurrent-policy-change states offer a clear next action. Disable duplicate submissions, restore focus after closing a modal and keep keyboard focus visible.

## Do's and Don'ts

Render client metadata as text. State that all-publication access includes future publications. Keep narrowing controls within the current grant. Show errors beside the decision that failed. Do not describe a null usage timestamp as proof a connection has never been used. Keep the test harness private under `test/fixtures/`; it is not a production route.
