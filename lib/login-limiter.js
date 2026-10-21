const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map();
function currentEntry(key, now) {
  const entry = failures.get(key);
  if (!entry || (entry.lockedUntil && entry.lockedUntil <= now)) {
    if (entry) failures.delete(key);
    return null;
  }
  return entry;
}
export function getLoginLock(keys, now = Date.now()) {
  let lockedUntil = 0;
  for (const key of keys) {
    const entry = currentEntry(key, now);
    if (entry?.lockedUntil > lockedUntil) lockedUntil = entry.lockedUntil;
  }
  return lockedUntil > now ? lockedUntil : null;
}
export function recordLoginFailure(keys, now = Date.now()) {
  for (const key of new Set(keys)) {
    const entry = currentEntry(key, now) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
    failures.set(key, entry);
  }
  return getLoginLock(keys, now);
}
export function clearLoginFailures(keys) {
  for (const key of new Set(keys)) failures.delete(key);
}
export function resetLoginLimiter() {
  failures.clear();
}
export const LOGIN_LOCKOUT_MS = LOCKOUT_MS;
