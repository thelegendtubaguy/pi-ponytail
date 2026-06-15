import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  filterSkillBodyForMode,
  parsePonytailCommand,
  readDefaultMode,
  resolveSessionMode,
  writeDefaultMode,
} from "../extensions/ponytail.js";

function withTempConfig(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-ponytail-config-"));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousDefault = process.env.PONYTAIL_DEFAULT_MODE;
  process.env.XDG_CONFIG_HOME = tempDir;
  delete process.env.PONYTAIL_DEFAULT_MODE;

  try {
    fn(tempDir);
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;

    if (previousDefault === undefined) delete process.env.PONYTAIL_DEFAULT_MODE;
    else process.env.PONYTAIL_DEFAULT_MODE = previousDefault;

    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("parsePonytailCommand falls back to full when invoked bare and default is off", () => {
  assert.deepEqual(parsePonytailCommand("", "off"), { type: "set-mode", mode: "full" });
});

test("parsePonytailCommand parses modes, status, and default subcommand", () => {
  assert.deepEqual(parsePonytailCommand("ultra", "full"), { type: "set-mode", mode: "ultra" });
  assert.deepEqual(parsePonytailCommand("status", "full"), { type: "status" });
  assert.deepEqual(parsePonytailCommand("default lite", "full"), { type: "set-default", mode: "lite" });
  assert.equal(parsePonytailCommand("wat", "full").type, "invalid");
});

test("resolveSessionMode prefers latest persisted session mode", () => {
  const entries = [
    { type: "custom", customType: "ponytail-mode", data: { mode: "lite" } },
    { type: "custom", customType: "ponytail-mode", data: { mode: "ultra" } },
  ];

  assert.equal(resolveSessionMode(entries, "full"), "ultra");
});

test("readDefaultMode and writeDefaultMode use XDG config path", () => withTempConfig((tempDir) => {
  const configPath = join(tempDir, "ponytail", "config.json");

  assert.equal(readDefaultMode(), "full");
  assert.equal(writeDefaultMode("ultra"), "ultra");
  assert.equal(readDefaultMode(), "ultra");
  assert.ok(existsSync(configPath));
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { defaultMode: "ultra" });
}));

test("PONYTAIL_DEFAULT_MODE overrides config", () => withTempConfig(() => {
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
