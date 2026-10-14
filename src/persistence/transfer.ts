import { FORM_NAMES } from "../content/evolution";
import { currentBiome } from "../domain/biome";
import { levelForXp } from "../domain/levels";
import { parseSave, SCHEMA_VERSION, type SaveFile } from "./schema";

/** Marks exported files so arbitrary JSON isn't mistaken for a save. */
export const EXPORT_FORMAT = "alien-harvester-save";
/** Generous for a save (a few KB), small enough to reject junk quickly. */
export const MAX_IMPORT_BYTES = 512 * 1024;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  save: SaveFile;
}

export function exportText(save: SaveFile): string {
  const file: ExportFile = { format: EXPORT_FORMAT, save };
  return JSON.stringify(file, null, 2);
}

/** A file name for downloads. The date only names the file; it's never read back. */
export function exportFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `alien-harvester-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export interface SaveSummary {
  /** Where the save is, e.g. "Research wing II": overwriting a deep save must be obvious. */
  place: string;
  level: number;
  form: string;
  biomass: number;
  genetic: number;
  parts: number;
  mutagen: number;
  crystals: number;
  alloy: number;
  amber: number;
  doorsOpen: number;
  questsDone: number;
  reactorRepaired: boolean;
}

export function summarize(save: SaveFile): SaveSummary {
  const p = save.progress;
  return {
    place: currentBiome(p).name,
    level: levelForXp(p.xp),
    form: FORM_NAMES[p.evolution] ?? "Unknown",
    biomass: Math.floor(p.banked.biomass),
    genetic: Math.floor(p.banked.genetic),
    parts: Math.floor(p.banked.parts),
    mutagen: Math.floor(p.banked.mutagen),
    crystals: Math.floor(p.banked.crystals),
    alloy: Math.floor(p.banked.alloy),
    amber: Math.floor(p.banked.amber),
    doorsOpen: p.unlockedDoors.length,
    questsDone: Object.values(p.quests).filter((q) => q.done).length,
    reactorRepaired: p.reactorRepaired,
  };
}

export type ImportResult =
  | { ok: true; save: SaveFile; summary: SaveSummary }
  | { ok: false; reason: "empty" | "tooLarge" | "notJson" | "wrongFormat" | "newer" | "invalid" };

export const IMPORT_ERRORS: Record<Exclude<ImportResult, { ok: true }>["reason"], string> = {
  empty: "Nothing to import.",
  tooLarge: "That file is too large to be a save.",
  notJson: "That isn't a save file (it couldn't be read).",
  wrongFormat: "That file isn't an Alien Harvester save.",
  newer: "That save was made by a newer version of the game. Update the game first.",
  invalid: "That save is damaged or incomplete, so it can't be loaded.",
};

/**
 * Validate an import completely before anything is replaced. Accepts an exported
 * file, or a bare save object (as stored), and runs the same strict validation
 * (and migrations) used for saves loaded from storage.
 */
export function parseImport(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (new Blob([trimmed]).size > MAX_IMPORT_BYTES) return { ok: false, reason: "tooLarge" };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "wrongFormat" };
  const obj = raw as Record<string, unknown>;
  const candidate = obj.format === EXPORT_FORMAT ? obj.save : "progress" in obj ? obj : null;
  if (candidate === null || typeof candidate !== "object") return { ok: false, reason: "wrongFormat" };
  const version = (candidate as Record<string, unknown>).schemaVersion;
  if (typeof version === "number" && version > SCHEMA_VERSION) return { ok: false, reason: "newer" };
  const save = parseSave(candidate);
  if (!save) return { ok: false, reason: "invalid" };
  return { ok: true, save, summary: summarize(save) };
}
