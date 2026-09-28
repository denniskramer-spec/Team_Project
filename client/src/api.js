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
  if (!res.ok) throw new ApiError(res.status, data.message || `${failure} (${res.status})`);
  return data;
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
