import { ThemeMode, UiPreferences } from '@shared/types';
import { apiUrl, fetchApiJson } from './api';

export interface ResolvedUiPreferences {
  themeMode: ThemeMode;
  fontScale: number;
}

export const UI_PREFERENCES_UPDATED_EVENT = 'sarva-ui-preferences-updated';
export const THEME_STORAGE_KEY = 'sarva_theme_mode';
export const FONT_SCALE_STORAGE_KEY = 'sarva_font_scale';
export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.25;
export const FONT_SCALE_STEP = 0.05;

const DEFAULT_PREFERENCES: ResolvedUiPreferences = {
  themeMode: 'dark',
  fontScale: 1,
};

const isThemeMode = (value: unknown): value is ThemeMode => value === 'dark' || value === 'light';

export const clampFontScale = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.fontScale;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
};

export const normalizeUiPreferences = (value?: Partial<UiPreferences> | null): ResolvedUiPreferences => {
  return {
    themeMode: isThemeMode(value?.themeMode) ? value.themeMode : DEFAULT_PREFERENCES.themeMode,
    fontScale: clampFontScale(Number(value?.fontScale ?? DEFAULT_PREFERENCES.fontScale)),
  };
};

export const readUiPreferencesFromStorage = (): ResolvedUiPreferences => {
  try {
    const themeValue = localStorage.getItem(THEME_STORAGE_KEY);
    const fontValue = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY));
    return normalizeUiPreferences({
      themeMode: isThemeMode(themeValue) ? themeValue : undefined,
      fontScale: Number.isFinite(fontValue) ? fontValue : undefined,
    });
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const writeUiPreferencesToStorage = (preferences: ResolvedUiPreferences): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preferences.themeMode);
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(preferences.fontScale));
  } catch {
    // ignore storage write failures
  }
};

export const applyUiPreferencesToDocument = (preferences: ResolvedUiPreferences): void => {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  body.classList.toggle('sarva-theme-light', preferences.themeMode === 'light');
  body.classList.toggle('sarva-theme-dark', preferences.themeMode === 'dark');
  root.style.fontSize = `${(16 * preferences.fontScale).toFixed(2)}px`;
  root.style.colorScheme = preferences.themeMode;
};

export const broadcastUiPreferencesUpdate = (preferences: ResolvedUiPreferences): void => {
  window.dispatchEvent(
    new CustomEvent<ResolvedUiPreferences>(UI_PREFERENCES_UPDATED_EVENT, {
      detail: preferences,
    })
  );
};

export const applyAndPersistUiPreferencesLocal = (preferences: ResolvedUiPreferences): ResolvedUiPreferences => {
  const normalized = normalizeUiPreferences(preferences);
  applyUiPreferencesToDocument(normalized);
  writeUiPreferencesToStorage(normalized);
  broadcastUiPreferencesUpdate(normalized);
  return normalized;
};

export const loadUiPreferencesFromServer = async (): Promise<ResolvedUiPreferences | null> => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const response = await fetchApiJson(apiUrl('/api/auth/preferences'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  return normalizeUiPreferences(response?.uiPreferences);
};

export const saveUiPreferencesToServer = async (
  preferences: ResolvedUiPreferences
): Promise<ResolvedUiPreferences | null> => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const payload = normalizeUiPreferences(preferences);
  const response = await fetchApiJson(apiUrl('/api/auth/preferences'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return normalizeUiPreferences(response?.uiPreferences || payload);
};

