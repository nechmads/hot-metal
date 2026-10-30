---
title: "Dropdown-triggered confirmations need explicit focus handoff"
kind: "pitfall"
status: "active"
visibility: "shared"
applies_to:
  - "apps/web/src/components/modal/Modal.tsx"
  - "apps/web/src/pages/IdeasPage.tsx"
tags:
  - "accessibility"
  - "dropdown"
  - "modal"
created_at: "2026-10-30"
updated_at: "2026-10-30"
created_by: "codex"
verified_at: "2026-10-30"
supersedes: []
superseded_by: null
---

The custom `Modal` focuses its first control on mount, but Radix dropdown
cleanup can subsequently leave focus on the body. For Ideas bulk confirmations,
`DropdownMenu.Content.onCloseAutoFocus` prevents default and focuses Cancel.
Restore focus after React has committed the closed/not-busy state: a trigger
still disabled during the handler cannot receive focus. If deleting the last
idea disables the trigger, focus the All filter instead.

## Evidence

- `apps/web/src/pages/IdeasPage.tsx` implements the handoff and restoration.
- Local browser checks on 2026-10-30 reproduced the body-focus failure and
  verified Cancel focus on opening/error, and All-filter focus after deleting
  every synthetic idea. Tested at desktop and 390px mobile widths.
