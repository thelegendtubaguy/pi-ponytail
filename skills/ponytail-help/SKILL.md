---
name: ponytail-help
description: >
  Quick-reference card for all Ponytail modes, skills, and pi commands.
  One-shot display, not a persistent mode. Trigger: /ponytail-help,
  "ponytail help", "what ponytail commands", "how do I use ponytail".
---

# Ponytail Help

Display this reference card when invoked. One-shot, do not change mode,
write config files, or persist anything.

## Levels

| Level | Trigger | What changes |
|-------|---------|--------------|
| **Lite** | `/ponytail lite` | Build what's asked, name the lazier alternative in one line. |
| **Full** | `/ponytail` or `/ponytail full` | Enforce the ladder: YAGNI → stdlib → native → one line → minimum. Default. |
| **Ultra** | `/ponytail ultra` | YAGNI extremist. Deletion before addition. Challenges requirements before building. |
| **Off** | `/ponytail off` | Disable persistent Ponytail instructions for the session. |

Level sticks until changed or disabled.

## Commands

| Command | What it does |
|---------|--------------|
| `/ponytail` | Enable the configured default mode. |
| `/ponytail lite\|full\|ultra\|off` | Set session mode. |
| `/ponytail status` | Show current/default mode. |
| `/ponytail default lite\|full\|ultra\|off` | Persist default mode. |
| `/ponytail-review` | Review a diff for over-engineering only. |
| `/ponytail-audit` | Audit the repo for bloat, speculative abstractions, and replaceable dependencies. |
| `/ponytail-debt` | List `ponytail:` shortcut/debt markers. |
| `/ponytail-help` | Show this card. |

## Deactivate

Say `stop ponytail` or `normal mode`. Resume anytime with `/ponytail`.

## Default mode

Environment variable, highest priority:

```bash
export PONYTAIL_DEFAULT_MODE=ultra
```

Config file: `$XDG_CONFIG_HOME/ponytail/config.json`, `~/.config/ponytail/config.json`, or `%APPDATA%\ponytail\config.json`:

```json
{ "defaultMode": "lite" }
```

Set `"off"` to disable auto-activation on session start.

## Install / update

```bash
pi install git:github.com/thelegendtubaguy/pi-ponytail
pi update git:github.com/thelegendtubaguy/pi-ponytail
```

Source: https://github.com/thelegendtubaguy/pi-ponytail
