export const PRODUCT_CATALOG_CHANGED_EVENT = 'sarva-products-changed';
const PRODUCT_CATALOG_CHANGED_STORAGE_KEY = 'sarva-products-changed-at';

export const notifyProductsChanged = () => {
  if (typeof window === 'undefined') return;

  const stamp = String(Date.now());
  try {
    window.localStorage.setItem(PRODUCT_CATALOG_CHANGED_STORAGE_KEY, stamp);
  } catch {
    // Ignore storage write failures and still dispatch the in-tab event.
  }
  window.dispatchEvent(new Event(PRODUCT_CATALOG_CHANGED_EVENT));
};

export const subscribeToProductsChanged = (callback: () => void) => {
  if (typeof window === 'undefined') return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PRODUCT_CATALOG_CHANGED_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener(PRODUCT_CATALOG_CHANGED_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(PRODUCT_CATALOG_CHANGED_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
};
