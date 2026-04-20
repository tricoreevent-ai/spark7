import { useEffect, useRef } from 'react';
import { CodeScannerSettings, isConfiguredScannerSubmitKey } from '../utils/codeScanner';

interface UseCodeScannerCaptureArgs {
  enabled: boolean;
  settings: CodeScannerSettings;
  onScan: (value: string) => void;
}

export const useCodeScannerCapture = ({
  enabled,
  settings,
  onScan,
}: UseCodeScannerCaptureArgs): void => {
  const onScanRef = useRef(onScan);
  const settingsRef = useRef(settings);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!enabled || settings.captureMode !== 'global') return undefined;

    let buffer = '';
    let lastKeyAt = 0;

    const resetBuffer = () => {
      buffer = '';
      lastKeyAt = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);

      if (isEditable && !target?.dataset.codeScannerAllowGlobal) {
        resetBuffer();
        return;
      }

      const activeSettings = settingsRef.current;

      if (isConfiguredScannerSubmitKey(event.key, activeSettings.submitKey)) {
        const value = buffer.trim().toUpperCase();
        resetBuffer();
        if (value.length >= activeSettings.minLength) {
          event.preventDefault();
          onScanRef.current(value);
        }
        return;
      }

      if (event.key.length !== 1) return;

      const now = Date.now();
      if (!lastKeyAt || now - lastKeyAt > activeSettings.interKeyDelayMs) {
        buffer = '';
      }

      buffer += event.key;
      lastKeyAt = now;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled, settings.captureMode]);
};
