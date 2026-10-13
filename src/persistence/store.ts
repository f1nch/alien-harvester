import Dexie, { type Table } from "dexie";
import type { MapDef } from "../content/map";
import { parseSave, SCHEMA_VERSION, type SaveFile } from "./schema";

interface Slot {
  /**
   * "current", "previous", "quarantine:<n>" for unreadable snapshots, or
   * "premigration:v<n>" for the raw save as it was before a schema upgrade.
   */
  key: string;
  data: unknown;
}

class SaveDB extends Dexie {
  slots!: Table<Slot, string>;
  constructor() {
    super("alien-harvester");
    this.version(1).stores({ slots: "key" });
  }
}

export type LoadResult =
  | { status: "ok"; save: SaveFile | null; recovered: boolean }
  /** A save from a newer build exists; this build must not play or write over it. */
  | { status: "newer" };

function schemaVersionOf(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const v = (data as Record<string, unknown>).schemaVersion;
  return typeof v === "number" ? v : null;
}

export class SaveStore {
  private db = new SaveDB();
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly room: MapDef) {}

  async load(): Promise<LoadResult> {
    const [current, previous] = await Promise.all([
      this.db.slots.get("current"),
      this.db.slots.get("previous"),
    ]);
    for (const slot of [current, previous]) {
      const v = slot ? schemaVersionOf(slot.data) : null;
      if (v !== null && v > SCHEMA_VERSION) return { status: "newer" };
    }

    // Before an older save is migrated and rotated away, keep its raw form permanently.
    const oldVersion = current ? schemaVersionOf(current.data) : null;
    if (current && oldVersion !== null && oldVersion < SCHEMA_VERSION) {
      const key = `premigration:v${oldVersion}`;
      try {
        if (!(await this.db.slots.get(key))) await this.db.slots.put({ key, data: current.data });
      } catch (err) {
        console.warn("Could not keep pre-migration snapshot", err);
      }
    }

    const cur = current ? parseSave(current.data, this.room) : null;
    if (cur) return { status: "ok", save: cur, recovered: false };
    const prev = previous ? parseSave(previous.data, this.room) : null;

    // Keep unreadable snapshots out of the rotation, append-only, so nothing is lost.
    // Best effort: a quota error here must not abort an otherwise good load.
    const bad = [current && !cur ? current : null, previous && !prev ? previous : null].filter(Boolean) as Slot[];
    for (const slot of bad) {
      try {
        const n = await this.db.slots.where("key").startsWith("quarantine:").count();
        await this.db.slots.put({ key: `quarantine:${n}`, data: slot.data });
      } catch (err) {
        console.warn("Could not quarantine unreadable save", err);
      }
    }
    return { status: "ok", save: prev, recovered: prev !== null && current !== undefined };
  }

  /**
   * Rotate current → previous and write the new snapshot in one transaction.
   * Refuses to write an invalid snapshot, and only rotates a valid one into
   * "previous", so a bad state can never evict the last good save.
   * Writes are serialised; a failed write leaves existing snapshots intact.
   */
  write(save: SaveFile): Promise<void> {
    const run = async () => {
      if (!parseSave(save, this.room)) throw new Error("Refusing to write an invalid save");
      await this.db.transaction("rw", this.db.slots, async () => {
        const old = await this.db.slots.get("current");
        if (old && parseSave(old.data, this.room)) await this.db.slots.put({ key: "previous", data: old.data });
        await this.db.slots.put({ key: "current", data: save });
      });
    };
    const p = this.writing.then(run, run);
    this.writing = p.catch(() => undefined);
    return p;
  }
}

/**
 * Single active-tab policy: only the lock holder may simulate and write.
 * Resolves false if another tab already holds it.
 * Without Web Locks support every tab proceeds (known gap; see README).
 */
export function acquireActiveTabLock(): Promise<boolean> {
  if (!("locks" in navigator)) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request("alien-harvester-active", { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Hold the lock for the lifetime of the page.
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(true));
  });
}
