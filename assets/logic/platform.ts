type QueryHost = {
  location?: { search?: string };
  URLSearchParams?: typeof URLSearchParams;
};

export function browserParams(isBrowser: boolean, host?: QueryHost): Pick<URLSearchParams, 'get'> {
  if (isBrowser && typeof host?.location?.search === 'string' && typeof host.URLSearchParams === 'function') {
    return new host.URLSearchParams(host.location.search);
  }
  return { get: () => null };
}

type WeChatStorage = {
  getStorageSync(key: string): string;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
};

export function wechatStorage(api: WeChatStorage): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  return {
    getItem: key => api.getStorageSync(key) || null,
    setItem: (key, value) => api.setStorageSync(key, value),
    removeItem: key => api.removeStorageSync(key),
  };
}

const PROGRESS_KEY = 'qingqiu-linglu:test-progress';
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const progressIO = {
  read: (storage: ProgressStorage) => storage.getItem(PROGRESS_KEY),
  write: (storage: ProgressStorage, value: string) => storage.setItem(PROGRESS_KEY, value),
  clear: (storage: ProgressStorage) => storage.removeItem(PROGRESS_KEY),
};
