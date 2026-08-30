---
"@becomeopc/dshx-hub-cli": patch
---

Reject removed workflow command groups before parsing their legacy options so saved commands receive the stable `deprecated_command` repair response without making a Hub request.
