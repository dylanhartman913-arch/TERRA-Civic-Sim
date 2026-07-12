/**
 * Persistence module — pure functions, no React.
 * Storage adapter pattern for testability.
 */

import type { ScenarioFile, SaveSlotMeta } from './types.js';

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export const SLOT_PREFIX = 'terra_save_';
export const MAX_SLOTS = 5;
export const STORAGE_VERSION = '3.1';
/** Schema versions accepted on import (migrated to current on load). */
const ACCEPTED_VERSIONS = new Set(['3.0', '3.1']);

/** Migrate a legacy 3.0 file to 3.1 (adds climate_lens: "historical"). */
function migrateScenarioFile(file: ScenarioFile): ScenarioFile {
  if (file.schema_version === '3.0') {
    return { ...file, schema_version: '3.1', climate_lens: 'historical' };
  }
  // Ensure climate_lens is present even on 3.1 files missing it
  if (!file.climate_lens) {
    return { ...file, climate_lens: 'historical' };
  }
  return file;
}

export function listSlots(storage: StorageAdapter): SaveSlotMeta[] {
  const slots: SaveSlotMeta[] = [];
  for (const key of storage.keys()) {
    if (!key.startsWith(SLOT_PREFIX)) continue;
    const raw = storage.get(key);
    if (!raw) continue;
    try {
      const file = JSON.parse(raw) as ScenarioFile;
      if (!ACCEPTED_VERSIONS.has(file.schema_version)) continue;
      slots.push({
        slot_id: key.slice(SLOT_PREFIX.length),
        name: file.name,
        year_reached: file.year_reached,
        exported_at: file.exported_at,
        scenario_name: file.activeScenario?.name ?? null,
        schema_version: file.schema_version,
      });
    } catch {
      // Skip corrupted slot
    }
  }
  return slots.sort((a, b) => a.slot_id.localeCompare(b.slot_id));
}

export function saveToSlot(
  storage: StorageAdapter,
  slot_id: string,
  file: ScenarioFile,
): void {
  storage.set(SLOT_PREFIX + slot_id, JSON.stringify(file));
}

export function loadFromSlot(
  storage: StorageAdapter,
  slot_id: string,
): ScenarioFile | null {
  const raw = storage.get(SLOT_PREFIX + slot_id);
  if (!raw) return null;
  return importFromJson(raw);
}

export function deleteSlot(storage: StorageAdapter, slot_id: string): void {
  storage.remove(SLOT_PREFIX + slot_id);
}

export function exportToJson(file: ScenarioFile): string {
  return JSON.stringify(file, null, 2);
}

export function importFromJson(json: string): ScenarioFile | null {
  try {
    const obj = JSON.parse(json) as ScenarioFile;
    if (!ACCEPTED_VERSIONS.has(obj.schema_version)) return null;
    return migrateScenarioFile(obj);
  } catch {
    return null;
  }
}
