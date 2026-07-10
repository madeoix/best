const DEFAULT_TIMEOUT_MS = 20_000;

function runtimeEnvironment() {
  return import.meta.env || {};
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function joinApiUrl(baseUrl, pathname) {
  const path = String(pathname || '').trim();

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedBase = trimTrailingSlash(baseUrl);

  return normalizedBase
    ? `${normalizedBase}${normalizedPath}`
    : normalizedPath;
}

export function publicApiUrl(pathname) {
  return joinApiUrl(
    runtimeEnvironment().VITE_SMALLVERSE_PUBLIC_API_BASE,
    pathname
  );
}

export function operatorApiUrl(pathname) {
  return joinApiUrl(
    runtimeEnvironment().VITE_SMALLVERSE_OPERATOR_API_BASE,
    pathname
  );
}

export class ApiRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
    this.url = options.url ?? null;
    this.details = options.details;
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });

    const payload = await response.json().catch(() => null);
    const error = payload?.error;

    if (!response.ok) {
      throw new ApiRequestError(
        error?.message || `Request failed with HTTP ${response.status}`,
        {
          status: response.status,
          code: error?.code,
          requestId:
            error?.requestId ||
            response.headers.get('x-request-id'),
          url,
          details: error?.details
        }
      );
    }

    if (payload === null) {
      throw new ApiRequestError('The server returned invalid JSON.', {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        url
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new ApiRequestError(
        `Request timed out after ${timeoutMs}ms.`,
        { url }
      );
    }

    throw new ApiRequestError(
      error?.message || 'The API request failed.',
      { url }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function publicRequestJson(pathname, options) {
  return requestJson(publicApiUrl(pathname), options);
}

export function operatorRequestJson(pathname, options) {
  return requestJson(operatorApiUrl(pathname), options);
}
