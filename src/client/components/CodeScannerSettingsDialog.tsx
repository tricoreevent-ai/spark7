import React, { useEffect, useState } from 'react';
import {
  CodeScannerSettings,
  DEFAULT_CODE_SCANNER_SETTINGS,
  mergeCodeScannerSettings,
} from '../utils/codeScanner';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface CodeScannerSettingsDialogProps {
  open: boolean;
  settings: CodeScannerSettings;
  onClose: () => void;
  onSave: (settings: CodeScannerSettings) => void;
}

const inputClass =
  'mt-1 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400';

export const CodeScannerSettingsDialog: React.FC<CodeScannerSettingsDialogProps> = ({
  open,
  settings,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<CodeScannerSettings>(settings);

  useEscapeKey(onClose, { enabled: open });

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/95 p-6 shadow-[0_28px_90px_rgba(2,6,23,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-scanner-settings-title"
      >
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Device Configuration</p>
            <h2 id="code-scanner-settings-title" className="mt-2 text-xl font-semibold text-white">
              Code Scanner
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              These settings are saved on this browser/device so each billing counter can use its own scanner behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm font-medium text-white">Capture Mode</label>
            <select
              className={`${inputClass} [&>option]:bg-slate-900`}
              value={draft.captureMode}
              onChange={(e) =>
                setDraft((prev) =>
                  mergeCodeScannerSettings({ ...prev, captureMode: e.target.value as CodeScannerSettings['captureMode'] })
                )
              }
            >
              <option value="input">Focused scanner input</option>
              <option value="global">Global capture</option>
            </select>
            <p className="mt-2 text-xs text-gray-400">
              Use focused input for most USB scanners. Use global capture if the scanner should work even when the cursor is not inside the scanner field.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm font-medium text-white">Scanner Submit Key</label>
            <select
              className={`${inputClass} [&>option]:bg-slate-900`}
              value={draft.submitKey}
              onChange={(e) =>
                setDraft((prev) =>
                  mergeCodeScannerSettings({ ...prev, submitKey: e.target.value as CodeScannerSettings['submitKey'] })
                )
              }
            >
              <option value="enter">Enter</option>
              <option value="tab">Tab</option>
            </select>
            <p className="mt-2 text-xs text-gray-400">
              Pick the suffix your scanner sends after the code. Most scanners use Enter by default.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm font-medium text-white">Minimum Code Length</label>
            <input
              type="number"
              min="1"
              max="32"
              value={draft.minLength}
              onChange={(e) =>
                setDraft((prev) => mergeCodeScannerSettings({ ...prev, minLength: Number(e.target.value || 1) }))
              }
              className={inputClass}
            />
            <p className="mt-2 text-xs text-gray-400">
              Ignore shorter accidental reads or manual keystrokes.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm font-medium text-white">Inter-key Delay (ms)</label>
            <input
              type="number"
              min="20"
              max="300"
              step="10"
              value={draft.interKeyDelayMs}
              onChange={(e) =>
                setDraft((prev) => mergeCodeScannerSettings({ ...prev, interKeyDelayMs: Number(e.target.value || 80) }))
              }
              className={inputClass}
            />
            <p className="mt-2 text-xs text-gray-400">
              Used by global capture to distinguish a fast scanner read from normal typing.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={draft.autoFocusInput}
              onChange={(e) =>
                setDraft((prev) => mergeCodeScannerSettings({ ...prev, autoFocusInput: e.target.checked }))
              }
            />
            Auto-focus the scanner input when the scanner is turned on
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_CODE_SCANNER_SETTINGS)}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Reset Defaults
          </button>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(mergeCodeScannerSettings(draft))}
              className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-400"
            >
              Save Scanner Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
