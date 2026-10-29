import { join } from "node:path";

// Publish and dist-tag OIDC support are both reviewed at this exact CLI version.
export const PUBLICATION_NPM_VERSION = "11.21.0";

export function assertPublicationOidcContext(env, mode) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "Gao-Gossssip/muha" ||
      env.GITHUB_REF !== "refs/heads/main" || !/^[a-f0-9]{40}$/.test(env.REVIEWED_REVISION ?? "") ||
      env.GITHUB_SHA !== env.REVIEWED_REVISION) {
    throw new Error("Publication requires the reviewed GitHub-hosted source");
  }
  if (!["publish", "promote"].includes(mode)) throw new Error("Use publish or promote");
  if (env.RUNNER_ENVIRONMENT !== "github-hosted" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_JOB !== mode ||
      env.GITHUB_WORKFLOW_REF !== "Gao-Gossssip/muha/.github/workflows/sdk-release.yml@refs/heads/main") {
    throw new Error("OIDC publication requires the hosted sdk-release workflow and matching job");
  }
  let endpoint;
  try { endpoint = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL); } catch { /* Never include the invalid value. */ }
  if (endpoint?.protocol !== "https:" || !endpoint.hostname.endsWith(".actions.githubusercontent.com") ||
      endpoint.username || endpoint.password || endpoint.hash ||
      typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN !== "string" || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.trim()) {
    throw new Error("GitHub OIDC is unavailable; require id-token: write for this job");
  }
  if (env.NPM_ID_TOKEN) {
    throw new Error("OIDC publication refuses supplied identity tokens; use GitHub OIDC requests");
  }
  for (const [name, value] of Object.entries(env)) {
    if (value && (/^(?:node_auth_token|npm_(?:publish_|auth_)?token)$/i.test(name) ||
        /^npm_config_.*(?:_auth(?:token)?|username|password)$/i.test(name))) {
      throw new Error("OIDC publication refuses legacy npm token credentials");
    }
  }
}

export function assertPublicationNpmVersion(version) {
  if (version !== PUBLICATION_NPM_VERSION) {
    throw new Error(`OIDC publication requires pinned npm ${PUBLICATION_NPM_VERSION}`);
  }
}

// npm runs outside any project, with two freshly generated credential-free files.
// This prevents a failed OIDC exchange from falling back to persistent npmrc auth.
export function publicationNpmEnvironment(env, directory) {
  return {
    ...Object.fromEntries(Object.entries(env).filter(([name]) => !/^npm_config_/i.test(name))),
    NPM_CONFIG_USERCONFIG: join(directory, "user.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: join(directory, "global.npmrc"),
  };
}
