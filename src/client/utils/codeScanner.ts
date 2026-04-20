export type CodeScannerCaptureMode = 'input' | 'global';
export type CodeScannerSubmitKey = 'enter' | 'tab';

export interface CodeScannerSettings {
  captureMode: CodeScannerCaptureMode;
  submitKey: CodeScannerSubmitKey;
  autoFocusInput: boolean;
  minLength: number;
  interKeyDelayMs: number;
}

const CODE_SCANNER_SETTINGS_KEY = 'sarva_code_scanner_settings_v1';

export const DEFAULT_CODE_SCANNER_SETTINGS: CodeScannerSettings = {
  captureMode: 'input',
  submitKey: 'enter',
  autoFocusInput: true,
  minLength: 3,
  interKeyDelayMs: 80,
};

export const mergeCodeScannerSettings = (
  saved?: Partial<CodeScannerSettings> | null
): CodeScannerSettings => ({
  captureMode: saved?.captureMode === 'global' ? 'global' : 'input',
  submitKey: saved?.submitKey === 'tab' ? 'tab' : 'enter',
  autoFocusInput: Boolean(saved?.autoFocusInput ?? DEFAULT_CODE_SCANNER_SETTINGS.autoFocusInput),
  minLength: Math.min(32, Math.max(1, Number(saved?.minLength || DEFAULT_CODE_SCANNER_SETTINGS.minLength))),
  interKeyDelayMs: Math.min(
    300,
    Math.max(20, Number(saved?.interKeyDelayMs || DEFAULT_CODE_SCANNER_SETTINGS.interKeyDelayMs))
  ),
});

export const getCodeScannerSettings = (): CodeScannerSettings => {
  try {
    const raw = localStorage.getItem(CODE_SCANNER_SETTINGS_KEY);
    if (!raw) return DEFAULT_CODE_SCANNER_SETTINGS;
    return mergeCodeScannerSettings(JSON.parse(raw) as Partial<CodeScannerSettings>);
  } catch {
    return DEFAULT_CODE_SCANNER_SETTINGS;
  }
};

export const saveCodeScannerSettings = (settings: CodeScannerSettings): CodeScannerSettings => {
  const normalized = mergeCodeScannerSettings(settings);
  localStorage.setItem(CODE_SCANNER_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
};

export const resetCodeScannerSettings = (): CodeScannerSettings => {
  localStorage.setItem(CODE_SCANNER_SETTINGS_KEY, JSON.stringify(DEFAULT_CODE_SCANNER_SETTINGS));
  return DEFAULT_CODE_SCANNER_SETTINGS;
};

export const isConfiguredScannerSubmitKey = (
  eventKey: string,
  submitKey: CodeScannerSubmitKey
): boolean => {
  if (submitKey === 'tab') return eventKey === 'Tab';
  return eventKey === 'Enter';
};

export const getCodeScannerModeLabel = (mode: CodeScannerCaptureMode): string =>
  mode === 'global' ? 'Global capture' : 'Focused input';

export const getCodeScannerSubmitLabel = (submitKey: CodeScannerSubmitKey): string =>
  submitKey === 'tab' ? 'Tab' : 'Enter';
