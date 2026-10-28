// Small fetch wrapper: sends cookies, parses JSON and throws readable errors.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Called when the server says the session is gone (401), so the app can drop
// the user and send them back to the login page. Wrong credentials on the
// login form itself are also a 401, so that call is left out.
let unauthorizedHandler = null;
export const onUnauthorized = (fn) => { unauthorizedHandler = fn; };

async function readResponse(res, path, failure) {
  let data;
  try {
    data = await res.json();
  } catch {
    if (res.ok) throw new ApiError(res.status, 'The server sent an unexpected response');
    data = {};
  }
  if (res.status === 401 && path !== '/auth/login') unauthorizedHandler?.();
  if (!res.ok) throw new ApiError(res.status, data.message || defaultMessage(res.status, failure));
  return data;
}

// A gateway in front of the API (the dev proxy, nginx) answers on its behalf
// while it is down or restarting; say that instead of a bare status code.
const GATEWAY_DOWN = new Set([502, 503, 504]);
function defaultMessage(status, failure) {
  if (GATEWAY_DOWN.has(status)) return 'The server is not responding, try again in a moment';
  if (status === 429) return 'Too many requests, wait a moment and try again';
  return `${failure} (${status})`;
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  return readResponse(res, path, 'Request failed');
}

// Uploads image files to one of the `/upload` routes. The answer's images
// carry `file` and `url`, ready to be stored on a record or shown as-is.
export function uploadImages(path, files) {
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  return upload(path, fd);
}

// Multipart upload (files in a FormData); same cookies and error handling as api().
export async function upload(path, formData) {
  let res;
  try {
    res = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: formData });
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  return readResponse(res, path, 'Upload failed');
}
