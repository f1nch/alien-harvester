import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { newProgress } from "../src/domain/progress";
import { defaultSettings, toSaveFile } from "../src/persistence/schema";
import { SaveStore } from "../src/persistence/store";

const snapshot = (biomass: number) => {
  const p = newProgress(FACILITY);
  p.banked.biomass = biomass;
  return toSaveFile(p, defaultSettings());
};

async function rawPut(key: string, data: unknown) {
  const db = new Dexie("alien-harvester");
  db.version(1).stores({ slots: "key" });
  await db.table("slots").put({ key, data });
  db.close();
}

async function rawKeys(): Promise<string[]> {
  const db = new Dexie("alien-harvester");
  db.version(1).stores({ slots: "key" });
  const keys = (await db.table("slots").toCollection().primaryKeys()) as string[];
  db.close();
  return keys;
}

beforeEach(async () => {
  await Dexie.delete("alien-harvester");
});

describe("SaveStore", () => {
  it("rotates current into previous on each write", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(1));
    await store.write(snapshot(2));
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(2);
  });

  it("refuses to write an invalid snapshot and keeps the good one", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(5));
    const bad = snapshot(0);
    bad.progress.banked.biomass = Infinity;
    await expect(store.write(bad)).rejects.toThrow();
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(5);
  });

  it("restores previous when current is corrupt, quarantines it, and never rotates it back in", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(7));
    await store.write(snapshot(7));
    await rawPut("current", { schemaVersion: 1, progress: "garbage" });
    const r = await store.load();
    expect(r).toMatchObject({ status: "ok", recovered: true });
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(7);
    expect(await rawKeys()).toContain("quarantine:0");

    // Writing after recovery must not evict the good previous with the corrupt current.
    await store.write(snapshot(8));
    await rawPut("current", "garbage again");
    const r2 = await new SaveStore(FACILITY).load();
    expect(r2.status === "ok" && r2.save?.progress.banked.biomass).toBe(7);
  });

  it("reports a newer-schema save instead of starting fresh", async () => {
    await rawPut("current", { ...snapshot(3), schemaVersion: 99 });
    expect(await new SaveStore(FACILITY).load()).toEqual({ status: "newer" });
  });
});

describe("pre-migration snapshot", () => {
  it("keeps the raw older save permanently, even after rotation", async () => {
    const v1 = JSON.parse(JSON.stringify(snapshot(9)));
    v1.schemaVersion = 1;
    delete v1.progress.quests;
    delete v1.progress.unlockedDoors;
    await rawPut("current", v1);
    const store = new SaveStore(FACILITY);
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(9);
    await store.write(snapshot(10));
    await store.write(snapshot(11));
    await new SaveStore(FACILITY).load();
    expect(await rawKeys()).toContain("premigration:v1");
  });
});

describe("import", () => {
  it("backs up the current save permanently, then replaces it", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(1));
    await store.write(snapshot(2));
    await store.importSave(snapshot(99));
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(99);
    expect(await rawKeys()).toContain("preimport:0");
    // Later writes never touch the backup.
    await store.write(snapshot(100));
    await store.write(snapshot(101));
    await store.importSave(snapshot(5));
    expect(await rawKeys()).toEqual(expect.arrayContaining(["preimport:0", "preimport:1"]));
  });

  it("refuses an invalid import and leaves the current save alone", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(7));
    const bad = snapshot(0);
    bad.progress.banked.biomass = Number.NaN;
    await expect(store.importSave(bad)).rejects.toThrow();
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(7);
  });
});

describe("import review regressions", () => {
  it("never reuses a backup number after a gap", async () => {
    const store = new SaveStore(FACILITY);
    await store.write(snapshot(1));
    await rawPut("preimport:3", { marker: "keep me" });
    await store.importSave(snapshot(2));
    const keys = await rawKeys();
    expect(keys).toContain("preimport:4");
    expect(keys).toContain("preimport:3");
  });

  it("importing with no current save backs nothing up and still works", async () => {
    const store = new SaveStore(FACILITY);
    await store.importSave(snapshot(42));
    const r = await store.load();
    expect(r.status === "ok" && r.save?.progress.banked.biomass).toBe(42);
    expect((await rawKeys()).filter((k) => k.startsWith("preimport:"))).toEqual([]);
  });
});
