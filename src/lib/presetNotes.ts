export const PRESET_NOTE_IDS = [
  'stain',
  'tear',
  'missingButton',
  'brokenZipper',
  'express24h',
  'noStarch',
  'starch',
  'ironOnly',
  'dryClean',
  'fragile',
  'alteration',
] as const;

export type PresetNoteId = (typeof PRESET_NOTE_IDS)[number];
