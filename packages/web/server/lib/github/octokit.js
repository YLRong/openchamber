import { Octokit } from '@octokit/rest';
import { getGitHubAuth } from './auth.js';
import { getGhCliToken } from './gh-cli-credential.js';

export function getOctokitOrNull() {
  const auth = getGitHubAuth();
  const token = auth?.accessToken || getGhCliToken();
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}
