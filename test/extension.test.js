import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import ponytailExtension, {
  filterSkillBodyForMode,
  parsePonytailCommand,
  readDefaultMode,
  resolveSessionMode,
  writeDefaultMode,
} from "../extensions/ponytail.js";

function createPiHarness() {
  const events = new Map();
  const commands = new Map();
  const appendedEntries = [];
  const sentUserMessages = [];

  const pi = {
    on: (eventName, handler) => events.set(eventName, handler),
    registerCommand: (name, options) => commands.set(name, options),
    appendEntry: (customType, data) => appendedEntries.push({ customType, data }),
    sendUserMessage: (text, options) => sentUserMessages.push({ text, options }),
  };

  ponytailExtension(pi);
  return { events, commands, appendedEntries, sentUserMessages };
}

function createCommandContext(overrides = {}) {
  return {
    isIdle: () => true,
    sessionManager: { getBranch: () => [], getEntries: () => [] },
    ui: { notify() {} },
    ...overrides,
  };
}

async function withTempConfig(fn) {
  const tempConfigHome = mkdtempSync(join(tmpdir(), "pi-ponytail-test-"));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousDefault = process.env.PONYTAIL_DEFAULT_MODE;
  process.env.XDG_CONFIG_HOME = tempConfigHome;
  delete process.env.PONYTAIL_DEFAULT_MODE;

  try {
    await fn(tempConfigHome);
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;

    if (previousDefault === undefined) delete process.env.PONYTAIL_DEFAULT_MODE;
    else process.env.PONYTAIL_DEFAULT_MODE = previousDefault;

    rmSync(tempConfigHome, { recursive: true, force: true });
  }
}

test("extension registers Ponytail commands", () => {
  const { commands } = createPiHarness();

  assert.deepEqual([...commands.keys()].sort(), [
    "ponytail",
    "ponytail-audit",
    "ponytail-debt",
    "ponytail-help",
    "ponytail-review",
  ]);
});

test("/ponytail updates session mode and injects instructions", () => withTempConfig(async () => {
  const { commands, events, appendedEntries } = createPiHarness();
  const ctx = createCommandContext();

  await events.get("session_start")({ reason: "startup" }, ctx);
  await commands.get("ponytail").handler("ultra", ctx);

  assert.deepEqual(appendedEntries.at(-1), {
    customType: "ponytail-mode",
    data: { mode: "ultra" },
  });

  const result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
  assert.ok(result.systemPrompt.includes("PONYTAIL MODE ACTIVE"));
  assert.ok(result.systemPrompt.includes("ultra"));
}));

test("session_start restores latest persisted mode", () => withTempConfig(async () => {
  const { events } = createPiHarness();
  const ctx = createCommandContext({
    sessionManager: {
      getBranch: () => [
        { type: "custom", customType: "ponytail-mode", data: { mode: "lite" } },
      ],
    },
  });

  await events.get("session_start")({ reason: "resume" }, ctx);
  const result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);

  assert.ok(result.systemPrompt.includes("lite"));
}));

test("skill alias commands delegate to Pi skill commands and preserve args", async () => {
  const { commands, sentUserMessages } = createPiHarness();
  const ctx = createCommandContext();

  await commands.get("ponytail-review").handler("current diff", ctx);
  await commands.get("ponytail-audit").handler("", ctx);
  await commands.get("ponytail-debt").handler("write ledger", ctx);
  await commands.get("ponytail-help").handler("", ctx);

  assert.deepEqual(sentUserMessages.map((entry) => entry.text), [
    "/skill:ponytail-review current diff",
    "/skill:ponytail-audit",
    "/skill:ponytail-debt write ledger",
    "/skill:ponytail-help",
  ]);
});

test("skill alias queues follow-up when agent is active", async () => {
  const { commands, sentUserMessages } = createPiHarness();
  const ctx = createCommandContext({ isIdle: () => false });

  await commands.get("ponytail-review").handler("", ctx);

  assert.deepEqual(sentUserMessages, [
    { text: "/skill:ponytail-review", options: { deliverAs: "followUp" } },
  ]);
});

test("normal mode disables persistent instructions", () => withTempConfig(async () => {
  const { commands, events } = createPiHarness();
  const ctx = createCommandContext();

  await events.get("session_start")({ reason: "startup" }, ctx);
  await commands.get("ponytail").handler("ultra", ctx);
  await events.get("input")({ text: "normal mode", source: "interactive" }, ctx);

  const disabled = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
  assert.equal(disabled, undefined);
}));

test("parsePonytailCommand falls back to full when invoked bare and default is off", () => {
  assert.deepEqual(parsePonytailCommand("", "off"), { type: "set-mode", mode: "full" });
});

test("parsePonytailCommand parses modes, status, and default subcommand", () => {
  assert.deepEqual(parsePonytailCommand("ultra", "full"), { type: "set-mode", mode: "ultra" });
  assert.deepEqual(parsePonytailCommand("status", "full"), { type: "status" });
  assert.deepEqual(parsePonytailCommand("default lite", "full"), { type: "set-default", mode: "lite" });
  assert.deepEqual(parsePonytailCommand("wat", "full"), { type: "invalid" });
});

test("resolveSessionMode prefers latest persisted session mode", () => {
  const entries = [
    { type: "custom", customType: "ponytail-mode", data: { mode: "lite" } },
    { type: "custom", customType: "ponytail-mode", data: { mode: "ultra" } },
  ];

  assert.equal(resolveSessionMode(entries, "full"), "ultra");
});

test("readDefaultMode and writeDefaultMode use XDG config path", () => withTempConfig(async (tempDir) => {
  const configPath = join(tempDir, "ponytail", "config.json");

  assert.equal(readDefaultMode(), "full");
  assert.equal(writeDefaultMode("ultra"), "ultra");
  assert.equal(readDefaultMode(), "ultra");
  assert.ok(existsSync(configPath));
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { defaultMode: "ultra" });
}));

test("PONYTAIL_DEFAULT_MODE overrides config", () => withTempConfig(async () => {
  writeDefaultMode("lite");
  process.env.PONYTAIL_DEFAULT_MODE = "off";

  assert.equal(readDefaultMode(), "off");
}));

test("filterSkillBodyForMode keeps only requested intensity examples and rows", () => {
  const body = `---\nname: ponytail\n---\n| **lite** | keep lite |\n| **full** | keep full |\n| **ultra** | keep ultra |\n- lite: Lite example\n- full: Full example\n- ultra: Ultra example\nOther line`;

  const filtered = filterSkillBodyForMode(body, "ultra");

  assert.ok(!filtered.includes("keep lite"));
  assert.ok(!filtered.includes("keep full"));
  assert.ok(filtered.includes("keep ultra"));
  assert.ok(!filtered.includes("Lite example"));
  assert.ok(filtered.includes("Ultra example"));
  assert.ok(filtered.includes("Other line"));
});

test("filterSkillBodyForMode keeps rule bullets that contain a colon", () => {
  const skillPath = join(import.meta.dirname, "..", "skills", "ponytail", "SKILL.md");
  const body = readFileSync(skillPath, "utf8");

  const filtered = filterSkillBodyForMode(body, "full");

  assert.ok(filtered.includes("No unrequested abstractions"));
  assert.ok(filtered.includes("Mark deliberate simplifications"));
  assert.ok(filtered.includes('full: "`@lru_cache'));
  assert.ok(!filtered.includes('lite: "Done'));
  assert.ok(!filtered.includes('ultra: "No cache'));
});
