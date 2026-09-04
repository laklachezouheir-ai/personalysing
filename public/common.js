async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `Erreur (${res.status})`);
  }
  return data;
}

async function requireSession(redirectIfLoggedOut = true) {
  const { user } = await api('/api/me');
  if (!user && redirectIfLoggedOut) {
    window.location.href = '/';
    return null;
  }
  return user;
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
}

function hideError(el) {
  if (!el) return;
  el.classList.remove('visible');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
