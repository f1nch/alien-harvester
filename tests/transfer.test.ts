import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { newProgress } from "../src/domain/progress";
import { defaultSettings, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { exportFileName, exportText, MAX_IMPORT_BYTES, parseImport } from "../src/persistence/transfer";

const sample = () => {
  const p = newProgress(FACILITY);
  p.banked = { biomass: 321.5, genetic: 12, parts: 3, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0 };
  p.xp = 400;
  p.evolution = 1;
  p.unlockedDoors.push("door-service");
  p.quests["q-first-catch"] = { count: 5, done: true };
  return toSaveFile(p, defaultSettings());
};

describe("save export and import", () => {
  it("round-trips an exported save exactly, with a readable summary", () => {
    const s = sample();
    const r = parseImport(exportText(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save).toEqual(s);
    expect(r.summary).toMatchObject({ level: 4, form: "Stalker form", biomass: 321, genetic: 12, parts: 3, doorsOpen: 1, questsDone: 1, reactorRepaired: false });
  });

  it("also accepts a bare save object (as stored)", () => {
    expect(parseImport(JSON.stringify(sample())).ok).toBe(true);
  });

  it("runs migrations on older exported saves", () => {
    const s = JSON.parse(JSON.stringify(sample())) as any;
    s.schemaVersion = 7;
    delete s.progress.reactorRepaired;
    delete s.progress.playSeconds;
    const r = parseImport(JSON.stringify({ format: "alien-harvester-save", save: s }));
    expect(r.ok && r.save.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it.each([
    ["empty", "   "],
    ["notJson", "{ not json"],
    ["wrongFormat", "[1,2,3]"],
    ["wrongFormat", JSON.stringify({ hello: "world" })],
    ["wrongFormat", JSON.stringify({ format: "alien-harvester-save", save: 5 })],
    ["newer", JSON.stringify({ format: "alien-harvester-save", save: { schemaVersion: 999, progress: {} } })],
    ["invalid", JSON.stringify({ format: "alien-harvester-save", save: { schemaVersion: SCHEMA_VERSION, progress: { banked: "lots" } } })],
  ])("rejects %s input safely", (reason, text) => {
    expect(parseImport(text)).toEqual({ ok: false, reason });
  });

  it("rejects oversized input before parsing it", () => {
    expect(parseImport(" ".repeat(10) + "x".repeat(MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("rejects tampered values the same way storage loads do", () => {
    const s = JSON.parse(exportText(sample()));
    s.save.progress.banked.biomass = -50;
    expect(parseImport(JSON.stringify(s))).toEqual({ ok: false, reason: "invalid" });
  });

  it("names files by date only", () => {
    expect(exportFileName(new Date(2026, 9, 13))).toBe("alien-harvester-2026-10-13.json");
  });
});

describe("import bounds", () => {
  it("rejects absurd amounts that could later overflow and block saving", () => {
    const s = JSON.parse(exportText(sample()));
    s.save.progress.upgradeSpent.capturePower = 1e308;
    expect(parseImport(JSON.stringify(s))).toEqual({ ok: false, reason: "invalid" });
  });
});
