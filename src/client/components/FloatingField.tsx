import React from 'react';

export type FloatingFieldOption = {
  value: string;
  label: string;
};

type FloatingFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
  name?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  readOnly?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  options?: FloatingFieldOption[];
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  dataLpignore?: string;
};

const baseControlClass =
  'peer w-full rounded-md border border-white/15 bg-slate-900/60 px-3 pb-2 pt-4 text-sm text-white outline-none transition placeholder-transparent focus:border-cyan-300/70 focus:bg-slate-900/80 focus:ring-2 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60';

export const FloatingField: React.FC<FloatingFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
  rows,
  min,
  max,
  step,
  maxLength,
  name,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  inputMode,
  readOnly = false,
  onKeyDown,
  options,
  className = '',
  inputClassName = '',
  labelClassName = '',
  dataLpignore,
}) => (
  <label className={`relative block ${className}`}>
    <span
      className={`pointer-events-none absolute -top-2 left-3 z-10 rounded bg-slate-900 px-1 text-[11px] font-semibold text-slate-300 transition-colors peer-focus:text-cyan-200 ${labelClassName}`}
    >
      {label}
      {required ? ' *' : ''}
    </span>
    {options ? (
      <select
        className={`${baseControlClass} [&>option]:bg-gray-900 [&>option]:text-white ${inputClassName}`}
        required={required}
        disabled={disabled}
        name={name}
        value={value}
        onKeyDown={onKeyDown}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : rows ? (
      <textarea
        className={`${baseControlClass} min-h-[78px] resize-y ${inputClassName}`}
        rows={rows}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        name={name}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        readOnly={readOnly}
        spellCheck={spellCheck}
        onKeyDown={onKeyDown}
        inputMode={inputMode}
        data-lpignore={dataLpignore}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <input
        className={`${baseControlClass} ${inputClassName}`}
        type={type}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        name={name}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        readOnly={readOnly}
        spellCheck={spellCheck}
        onKeyDown={onKeyDown}
        inputMode={inputMode}
        data-lpignore={dataLpignore}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )}
  </label>
);

export default FloatingField;
