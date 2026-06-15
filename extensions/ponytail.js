import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const DEFAULT_MODE = "full";
export const VALID_MODES = ["off", "lite", "full", "ultra"];

const skillPath = fileURLToPath(new URL("../skills/ponytail/SKILL.md", import.meta.url));

export function normalizeMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return VALID_MODES.includes(normalized) ? normalized : null;
}

export function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "ponytail");

  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "ponytail");
  }

  return join(homedir(), ".config", "ponytail");
}

export function getConfigPath() {
  return join(getConfigDir(), "config.json");
}

export function readDefaultMode() {
  const envMode = normalizeMode(process.env.PONYTAIL_DEFAULT_MODE);
  if (envMode) return envMode;

  try {
    const config = JSON.parse(readFileSync(getConfigPath(), "utf8"));
    return normalizeMode(config.defaultMode) || DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function writeDefaultMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return null;

  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ defaultMode: normalized }, null, 2)}\n`, "utf8");
  return normalized;
}

export function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || "").replace(/^---[\s\S]*?---\s*/, "");

  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1]);
        if (labelMode) return labelMode === effectiveMode;
      }

      const exampleLabel = line.match(/^-\s*([^:]+):\s*/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1]);
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join("\n");
}

export function getPonytailInstructions(mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;

  try {
    const body = readFileSync(skillPath, "utf8");
    return `PONYTAIL MODE ACTIVE — level: ${effectiveMode}\n\n${filterSkillBodyForMode(body, effectiveMode)}`;
  } catch {
    return null;
  }
}

export function resolveSessionMode(entries, fallbackMode = DEFAULT_MODE) {
  const fallback = normalizeMode(fallbackMode) || DEFAULT_MODE;
  if (!Array.isArray(entries)) return fallback;

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry.customType !== "ponytail-mode") continue;

    const mode = normalizeMode(entry?.data?.mode);
    if (mode) return mode;
  }

  return fallback;
}

export function parsePonytailCommand(text, defaultMode = DEFAULT_MODE) {
  const fallback = normalizeMode(defaultMode) || DEFAULT_MODE;
  const normalizedText = String(text || "").trim().toLowerCase();

  if (!normalizedText) {
    return { type: "set-mode", mode: fallback === "off" ? DEFAULT_MODE : fallback };
  }

  const [primary, secondary] = normalizedText.split(/\s+/);

  if (primary === "status") return { type: "status" };

  if (primary === "default") {
    const mode = normalizeMode(secondary);
    return mode ? { type: "set-default", mode } : { type: "invalid" };
  }

  const mode = normalizeMode(primary);
  return mode ? { type: "set-mode", mode } : { type: "invalid" };
}

export default function ponytailExtension(pi) {
  let configuredDefaultMode = readDefaultMode();
  let currentMode = configuredDefaultMode;

  const setMode = (mode, ctx) => {
    const normalized = normalizeMode(mode);
    if (!normalized) return;

    currentMode = normalized;
    pi.appendEntry("ponytail-mode", { mode: normalized });
    ctx?.ui?.notify?.(`Ponytail mode set to ${normalized}.`, "info");
  };

  const sendAlias = (skillName, args, ctx) => {
    const suffix = String(args || "").trim();
    const message = suffix ? `/skill:${skillName} ${suffix}` : `/skill:${skillName}`;

    if (ctx?.isIdle?.() === false) {
      pi.sendUserMessage(message, { deliverAs: "followUp" });
      ctx?.ui?.notify?.(`/${skillName} queued as follow-up.`, "info");
      return;
    }

    pi.sendUserMessage(message);
  };

  pi.registerCommand("ponytail", {
    description: "Set Ponytail lazy-dev mode: lite, full, ultra, off, status, or default <mode>",
    handler: async (args, ctx) => {
      const parsed = parsePonytailCommand(args, configuredDefaultMode);

      if (parsed.type === "status") {
        ctx?.ui?.notify?.(`Ponytail: current ${currentMode} • default ${configuredDefaultMode}`, "info");
        return;
      }

      if (parsed.type === "set-default") {
        const written = writeDefaultMode(parsed.mode);
        if (written) {
          configuredDefaultMode = readDefaultMode();
          const message = configuredDefaultMode === written
            ? `Default Ponytail mode set to ${written}.`
            : `Saved default ${written}, but PONYTAIL_DEFAULT_MODE keeps default at ${configuredDefaultMode}.`;
          ctx?.ui?.notify?.(message, "info");
        }
        return;
      }

      if (parsed.type === "set-mode") {
        setMode(parsed.mode, ctx);
        return;
      }

      ctx?.ui?.notify?.("Unknown /ponytail mode. Use lite, full, ultra, off, status, or default <mode>.", "warning");
    },
  });

  for (const name of ["ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-help"]) {
    pi.registerCommand(name, {
      description: `Run /skill:${name}`,
      handler: (args, ctx) => sendAlias(name, args, ctx),
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx?.sessionManager?.getBranch?.() || ctx?.sessionManager?.getEntries?.() || [];
    configuredDefaultMode = readDefaultMode();
    currentMode = resolveSessionMode(entries, configuredDefaultMode);
  });

  pi.on("input", async (event) => {
    if (event?.source === "extension") return { action: "continue" };

    const text = String(event?.text || "");
    if (currentMode !== "off" && /\b(stop ponytail|normal mode)\b/i.test(text)) {
      setMode("off");
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event) => {
    if (!currentMode || currentMode === "off") return;

    const instructions = getPonytailInstructions(currentMode);
    if (!instructions) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
    };
  });
}
