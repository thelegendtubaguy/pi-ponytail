# pi-ponytail

Ponytail lazy senior developer mode for pi. YAGNI first, stdlib/native before dependencies, smallest working diff, one runnable check for non-trivial logic.

Source behavior is adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

## Install

```bash
pi install npm:pi-ponytail
```

Try without installing:

```bash
pi -e npm:pi-ponytail
```

## Commands

- `/ponytail` — enable the configured default mode (`full` unless changed).
- `/ponytail lite|full|ultra|off` — set session mode.
- `/ponytail status` — show current and default mode.
- `/ponytail default lite|full|ultra|off` — persist the default mode in the Ponytail config file.
- `/ponytail-review` — run the over-engineering review skill.
- `/ponytail-audit` — run the whole-repo over-engineering audit skill.
- `/ponytail-debt` — list `ponytail:` debt markers.
- `/ponytail-help` — show the quick reference.

Say `stop ponytail` or `normal mode` to disable the persistent mode in the current session.

## Default mode

Resolution order:

1. `PONYTAIL_DEFAULT_MODE=lite|full|ultra|off`
2. `$XDG_CONFIG_HOME/ponytail/config.json` or `~/.config/ponytail/config.json`
3. `full`

Config file shape:

```json
{ "defaultMode": "full" }
```

## pi package manifest

`package.json` exposes:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/ponytail.js"],
    "skills": ["./skills"]
  }
}
```

## Development

```bash
npm test
npm pack --dry-run
```
