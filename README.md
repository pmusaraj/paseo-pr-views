# GitHub PR Views for Paseo

Saved GitHub pull request searches inside Paseo. Suggested repository: `pmusaraj/paseo-pr-views`.

- Create, preview, edit and delete named query views. Views sync through Paseo's host settings.
- Start with **Mine**: `is:pr author:@me state:open archived:false sort:updated-desc`. It is editable and removable, including when it is the last view.
- Use GitHub search qualifiers, AND/OR, parentheses and relative UTC dates (`@today`, `@today-30d`). All results are scoped to pull requests and retain GitHub's search order.
- See PR state, review status, draft status, repository, author, update time, checks, comments, linked issues, labels and added/deleted lines.
- Open PR details in Paseo. Open GitHub in the browser with the hover action (also revealed by keyboard focus and always visible on touch devices).
- Start a workspace chat from a PR using the current Paseo desktop/web composer preferences, with a chance to edit the prompt and launch options.

## Requirements and installation

Requires Paseo 0.8 or newer and an authenticated GitHub CLI (`gh auth login`) on the daemon machine. Workspace launches require a matching Paseo project; fork/upstream remotes are supported.

Once this repository is published:

```sh
paseo plugin add pmusaraj/paseo-pr-views
```

For local development:

```sh
pnpm install
paseo plugin install "$PWD" --id pr-views
paseo plugin reload pr-views
```

The manifest id is `pr-views`. It can coexist with `github-integration`; settings and disk caches are separate. No build step is required: Paseo loads the TypeScript entry points.

## Background checks

Edit a view and enable **Add background check** to check for newly matching PRs every ten minutes while the Paseo daemon runs. For existing views, the checkbox saves immediately, independently of draft name or query edits. For a new view, it is saved with the view. Checks continue with the PR surface closed. The first successful check establishes a baseline without a notification; existing views are opted out by default.

A green dot appears on each view with new matches, and next to **GitHub PRs** in the sidebar while any view is unread. Opening a marked view refreshes the results and clears its marker across clients. A view already open refreshes and clears automatically. Reordering, comments and updates to existing PRs do not count as new matches. A PR leaving and later re-entering a view does count. Renaming a view preserves its baseline; changing its query or GitHub account starts a fresh baseline.

Only PR IDs are fetched, including pagination. Checks retain their baseline and marker on network errors. Views over GitHub's 1,000-result search limit must be narrowed; check errors appear above the selected view's toolbar. Baselines and unread state survive daemon restarts. Overlapping checks are coalesced, and acknowledgement revisions prevent a delayed opening from clearing a newer notification.

Paseo 0.8 has neither a sidebar badge slot nor a server-side settings reader. The sidebar uses a green-dot label updated through its contribution API. The daemon reads (never writes) `PASEO_HOME/plugin-settings/pr-views/saved-views.json`; install with the manifest ID `pr-views`. Check state lives in the plugin's separate state directory. These compatibility boundaries are isolated in `index.client.tsx` and `server/background/storage.ts`. Clients poll notification status every 15 seconds; this does not trigger GitHub requests more often than the ten-minute per-view interval.

## Model preferences compatibility

The Paseo 0.8 plugin SDK does not expose the composer's saved defaults. On desktop/web, the plugin reads the host's `@paseo:create-agent-preferences` storage key each time the launch dialog opens. It never writes that key or remembers its own model selection. The selected provider, model, mode and per-model thinking setting are validated against the live provider catalog.

This adapter is in `client/web.ts` and `client/lib/launch-preferences.ts`. It depends on a private host storage format and should be replaced when Paseo adds a public getter. Native clients and clients without readable preferences fall back to the live provider catalog's defaults; their current composer selection cannot be recovered through this SDK. The dialog shows the resulting selection before launch.

## Development

```sh
pnpm typecheck
pnpm test
bin/lint --fix
pnpm lint
```

`index.client.tsx` registers the saved-view surface. `index.server.ts` registers search, PR detail/actions, launch RPCs and host settings. GitHub runs on the daemon via argument-based `gh` subprocesses. Search uses advanced GraphQL search with cursor pagination, a five-minute cache and GitHub's 1,000-result limit. Refresh bypasses the cache. PR line counts are fetched in the search query, without one extra request per PR.

Regression tests cover query parsing, pagination/deduplication, settings defaults and deletion, PR line counts, host model preference parsing, review state and caches. Live host rendering and workspace launch should be checked after installing locally.

## Credits

Derived from [alysnnix/paseo-github-integration](https://github.com/alysnnix/paseo-github-integration), including the saved-query work in [pmusaraj's fork](https://github.com/pmusaraj/paseo-github-integration). The upstream MIT license is preserved in `LICENSE`.
