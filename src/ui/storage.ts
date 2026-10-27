// localStorage can be missing or throw (private mode, blocked site data).
// Every access goes through these helpers so the app works without it.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: preference simply won't persist
  }
}
