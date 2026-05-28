import { execFileSync } from 'child_process';

/**
 * Returns a GitHub token from the `gh` CLI if it is installed and
 * authenticated, or null otherwise.
 */
export function getGhCliToken() {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}
