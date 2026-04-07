import React from 'react';

export interface CardTabItem<T extends string> {
  key: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface CardTabsProps<T extends string> {
  items: Array<CardTabItem<T>>;
  activeKey: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
  compact?: boolean;
  frame?: boolean;
  className?: string;
  listClassName?: string;
}

const cardFrameClass = 'rounded-xl border border-white/10 bg-white/5 p-2';
const listDefaultClass = 'flex flex-wrap gap-2';
const buttonBaseClass =
  'cursor-pointer rounded-md text-left font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-50';
const buttonSizeRegularClass = 'px-3 py-1.5 text-sm';
const buttonSizeCompactClass = 'px-3 py-1 text-xs';
const buttonActiveClass = 'bg-indigo-500 text-white';
const buttonInactiveClass = 'bg-white/5 text-gray-300 hover:bg-white/10';

const joinClassNames = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(' ');

export function CardTabs<T extends string>({
  items,
  activeKey,
  onChange,
  ariaLabel = 'Tabs',
  compact = false,
  frame = true,
  className = '',
  listClassName = '',
}: CardTabsProps<T>) {
  const sizeClass = compact ? buttonSizeCompactClass : buttonSizeRegularClass;

  return (
    <div className={joinClassNames(frame && cardFrameClass, className)}>
      <div role="tablist" aria-label={ariaLabel} className={joinClassNames(listDefaultClass, listClassName)}>
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={String(item.key)}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              className={joinClassNames(
                buttonBaseClass,
                sizeClass,
                isActive ? buttonActiveClass : buttonInactiveClass
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
