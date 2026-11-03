export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch'
  | 'inventory' | 'interact' | 'craft' | 'adjust' | 'fullscreen';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Avancer', back: 'Reculer', left: 'Gauche', right: 'Droite', jump: 'Sauter', sprint: 'Courir',
  crouch: "S'accroupir", inventory: 'Inventaire', interact: 'Interagir', craft: 'Fabrication', adjust: "Régler l'arme",
  fullscreen: 'Plein écran',
};

export const DEFAULT_KEYS: Record<Action, string[]> = {
  forward: ['z', 'w'], back: ['s'], left: ['q', 'a'], right: ['d'],
  jump: ['Space'], sprint: ['Shift'], crouch: ['Control'],
  inventory: ['e'], interact: ['f'], craft: ['c'], adjust: ['r'], fullscreen: ['F11'],
};

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  master: number;
  sfx: number;
  music: number;
  clouds: boolean;
  showFps: boolean;
  invertY: boolean;
  helpSeen: boolean;
  creative: boolean;
  /** Plateforme choisie au lancement : ordinateur (clavier, souris) ou mobile (tactile). */
  platform: 'pc' | 'mobile' | null;
  keys: Record<Action, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: 6, fov: 75, sensitivity: 1, master: 0.7, sfx: 0.8, music: 0.4,
  clouds: true, showFps: false, invertY: false, helpSeen: false, creative: false, platform: null,
  keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
};

const LS_KEY = 'geocraft.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      const s = { ...DEFAULT_SETTINGS, ...p, keys: { ...DEFAULT_KEYS, ...(p.keys ?? {}) } };
      return s;
    }
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
