import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export const getCurrentTenantId = (): string | undefined => tenantStorage.getStore()?.tenantId;

export const runWithTenantContext = <T>(tenantId: string | undefined, work: () => T): T => {
  if (!tenantId) return work();
  return tenantStorage.run({ tenantId }, work);
};

