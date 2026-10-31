export const LINE_COUNTS = [1, 2, 3, 4, 5, 6, 7];

export const QUALITY_LEVELS = {
  fast: { label: 'Fast', nodes: 1_000_000 },
  standard: { label: 'Standard', nodes: 10_000_000 },
};

// Maia3 strength levels: 600 to 2600 in steps of 100.
export const RATINGS = Array.from({ length: 21 }, (_, i) => 600 + i * 100);

export const DEFAULT_SETTINGS = { lines: 3, quality: 'fast', rating: 1500 };

const STORAGE_KEY = 'fen-viewer.eval';

export function loadSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    /* ignore corrupt storage */
  }
  return normalizeSettings(saved);
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    /* ignore storage errors */
  }
}

// Falls back to defaults for any missing or out-of-range value.
export function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const lines = Number(source.lines);
  const rating = Number(source.rating);
  return {
    lines: LINE_COUNTS.includes(lines) ? lines : DEFAULT_SETTINGS.lines,
    quality: Object.hasOwn(QUALITY_LEVELS, source.quality) ? source.quality : DEFAULT_SETTINGS.quality,
    rating: RATINGS.includes(rating) ? rating : DEFAULT_SETTINGS.rating,
  };
}
