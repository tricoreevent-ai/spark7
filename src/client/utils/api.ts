export interface ApiJson {
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000';

export const getApiBaseUrl = (): string => {
  const env = (import.meta as any)?.env || {};
  const configured = env.VITE_API_BASE_URL || env.VITE_API_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return trimTrailingSlash(configured.trim());
  }

  if (window.location.protocol === 'file:') {
    return LOCAL_API_BASE_URL;
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Force IPv4 locally because the API server may bind only to 0.0.0.0 on Windows.
    return LOCAL_API_BASE_URL;
  }

  // For network access from other machines, use current hostname with port 3000
  // This allows accessing app via http://192.168.x.x:3000 from other machines
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:3000`;
};

export const apiUrl = (path: string): string => {
  const base = getApiBaseUrl();
  if (path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}/${path}`;
};

const snippet = (value: string, max = 160): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

export const parseApiResponse = async (response: Response): Promise<ApiJson> => {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  let parsed: ApiJson | null = null;

  if (contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(text) as ApiJson;
    } catch {
      throw new Error(`Invalid JSON response from API. ${snippet(text)}`);
    }
  } else {
    try {
      parsed = JSON.parse(text) as ApiJson;
    } catch {
      throw new Error(
        `API returned non-JSON response (${response.status}). ${snippet(text) || 'Please ensure backend server is running.'}`
      );
    }
  }

  if (!response.ok || parsed?.success === false) {
    throw new Error(parsed?.error || parsed?.message || `Request failed with status ${response.status}`);
  }

  return parsed;
};

export const fetchApiJson = async (input: RequestInfo | URL, init?: RequestInit): Promise<ApiJson> => {
  const response = await fetch(input, init);
  return parseApiResponse(response);
};
