import { useEffect, useRef } from 'react';

interface UseEscapeKeyOptions {
  enabled?: boolean;
  ignoreTypingTarget?: boolean;
  preventDefault?: boolean;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  const tag = String(element?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(element?.isContentEditable);
};

export const useEscapeKey = (
  onEscape: () => void,
  options: UseEscapeKeyOptions = {}
) => {
  const {
    enabled = true,
    ignoreTypingTarget = false,
    preventDefault = true,
  } = options;

  const handlerRef = useRef(onEscape);

  useEffect(() => {
    handlerRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      if (ignoreTypingTarget && isTypingTarget(event.target)) return;

      if (preventDefault) {
        event.preventDefault();
      }

      handlerRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, ignoreTypingTarget, preventDefault]);
};

export default useEscapeKey;
