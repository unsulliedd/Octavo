// Octavo's pages on GitHub.

const REPOSITORY = "https://github.com/unsulliedd/Octavo";

export const LINKS = {
  repository: REPOSITORY,
  releases: `${REPOSITORY}/releases`,
  newIssue: `${REPOSITORY}/issues/new`,
  license: `${REPOSITORY}/blob/main/LICENSE`,
};

/** The release page of `version`, with its notes. */
export const releaseUrl = (version: string) => `${LINKS.releases}/tag/v${version.replace(/^v/, "")}`;
