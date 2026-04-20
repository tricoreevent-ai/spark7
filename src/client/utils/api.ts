export interface ApiJson {
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const isLocalHost = (value: string): boolean => LOCAL_HOSTS.has(String(value || '').trim().toLowerCase());

const shouldUseConfiguredBase = (configured: string): boolean => {
  if (typeof window === 'undefined') return true;
  if (window.location.protocol === 'file:') return true;

  try {
    const parsed = new URL(configured, window.location.origin);
    const configuredIsLocal = isLocalHost(parsed.hostname);
    const browserIsLocal = isLocalHost(window.location.hostname);
    if (configuredIsLocal && !browserIsLocal) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
};

export const getApiBaseUrl = (): string => {
  const env = (import.meta as any)?.env || {};
  const configured = env.VITE_API_BASE_URL || env.VITE_API_URL;
  if (typeof configured === 'string' && configured.trim() && shouldUseConfiguredBase(configured.trim())) {
    return trimTrailingSlash(configured.trim());
  }

  if (window.location.protocol === 'file:') {
    return LOCAL_API_BASE_URL;
  }

  if (isLocalHost(window.location.hostname)) {
    // Force IPv4 locally because the API server may bind only to 0.0.0.0 on Windows.
    return LOCAL_API_BASE_URL;
  }

  // Hosted web deployments should default to same-origin /api requests.
  return '';
};

export const apiUrl = (path: string): string => {
  const base = getApiBaseUrl();
  if (path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}/${path}`;
};

export const resolveAppAssetUrl = (path: string): string => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return '';

  const relativePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  if (typeof window === 'undefined') {
    return apiUrl(relativePath);
  }

  if (window.location.protocol === 'file:') {
    return `${LOCAL_API_BASE_URL}${relativePath}`;
  }

  const base = getApiBaseUrl();
  if (!base) {
    return relativePath;
  }

  try {
    const parsedBase = new URL(base, window.location.origin);
    const sameOrigin = parsedBase.origin === window.location.origin;
    const browserUsesHttp = ['http:', 'https:'].includes(window.location.protocol);
    const bothLocalHosts = isLocalHost(window.location.hostname) && isLocalHost(parsedBase.hostname);

    // During local development we prefer same-origin asset URLs so Vite can proxy them
    // and the browser does not block image previews due to cross-origin resource policy.
    if (sameOrigin || (browserUsesHttp && bothLocalHosts)) {
      return relativePath;
    }
  } catch {
    return apiUrl(relativePath);
  }

  return `${base}${relativePath}`;
};

const snippet = (value: string, max = 160): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

const describeRequestTarget = (input: RequestInfo | URL): string => {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : String(input || '');

  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname || raw;
  } catch {
    return raw;
  }
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
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error: any) {
    const target = describeRequestTarget(input);
    const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const localDevelopmentHint =
      typeof window !== 'undefined' && isLocalHost(window.location.hostname)
        ? ' For local development, make sure `npm run dev:server` is running on port 3000.'
        : '';
    const reason = browserOffline
      ? 'Your device appears to be offline.'
      : 'The browser could not reach the application server.';
    throw new Error(`${reason} Request: ${target}. Please check internet access, the deployed backend, or API routing.${localDevelopmentHint}`);
  }
  return parseApiResponse(response);
};
