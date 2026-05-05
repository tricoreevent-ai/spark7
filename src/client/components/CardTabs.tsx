import React from 'react';
import { Tooltip } from '@mui/material';

export interface CardTabItem<T extends string> {
  key: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
  tooltip?: React.ReactNode;
  tooltipTrigger?: 'button' | 'icon';
  tooltipAriaLabel?: string;
  ariaLabel?: string;
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
export const cardTabsTooltipSlotProps = {
  popper: {
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [0, 14],
        },
      },
      {
        name: 'flip',
        options: {
          fallbackPlacements: ['bottom-start', 'bottom-end', 'right-start', 'left-start', 'top-start', 'top-end'],
        },
      },
      {
        name: 'preventOverflow',
        options: {
          padding: 12,
          altAxis: true,
        },
      },
    ],
  },
  tooltip: {
    sx: {
      bgcolor: 'transparent',
      color: '#e5eefc',
      border: 'none',
      borderRadius: '20px',
      boxShadow: 'none',
      p: 0,
      maxWidth: 'none',
      width: 'min(760px, calc(100vw - 24px))',
    },
  },
  arrow: {
    sx: {
      color: '#10182d',
    },
  },
} as const;

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
          const iconTooltip = item.tooltip && item.tooltipTrigger === 'icon'
            ? (
              <Tooltip
                arrow
                placement="bottom-start"
                title={item.tooltip}
                slotProps={cardTabsTooltipSlotProps}
                enterDelay={120}
                leaveDelay={100}
                disableInteractive={false}
              >
                <span
                  aria-label={item.tooltipAriaLabel || `More information about ${String(item.ariaLabel || item.key)}`}
                  data-disable-auto-tooltip="true"
                  className={joinClassNames(
                    'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition',
                    isActive
                      ? 'border-white/30 bg-white/15 text-white hover:bg-white/20'
                      : 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:border-cyan-200/45 hover:bg-cyan-400/16 hover:text-white'
                  )}
                >
                  i
                </span>
              </Tooltip>
            )
            : null;
          const button = (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={item.ariaLabel}
              title={item.tooltip ? undefined : item.title}
              data-disable-auto-tooltip={item.tooltip ? 'true' : undefined}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              className={joinClassNames(
                buttonBaseClass,
                sizeClass,
                isActive ? buttonActiveClass : buttonInactiveClass
              )}
            >
              {iconTooltip ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>{item.label}</span>
                  {iconTooltip}
                </span>
              ) : item.label}
            </button>
          );

          if (item.tooltip && item.tooltipTrigger !== 'icon') {
            return (
              <Tooltip
                key={String(item.key)}
                arrow
                placement="bottom-start"
                title={item.tooltip}
                slotProps={cardTabsTooltipSlotProps}
                enterDelay={150}
                leaveDelay={120}
                disableInteractive={false}
              >
                <span className="inline-flex">{button}</span>
              </Tooltip>
            );
          }

          return React.cloneElement(button, { key: String(item.key) });
        })}
      </div>
    </div>
  );
}
