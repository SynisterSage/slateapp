// Lightweight proxy to the canonical ESM callback handler in `.mjs`.
import handler from './auth-gmail-callback.mjs';

export default async function proxyHandler(req, res) {
  return handler(req, res);
}
