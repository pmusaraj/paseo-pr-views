# GitHub PR Views for Paseo

Keep track of GitHub pull requests from Paseo with saved searches, background checks, and quick access to workspace chats.

![GitHub PR Views showing saved searches, pull request statuses, and line changes](images/github-pr-views.png)

- Create named views using GitHub search queries. The default **Mine** view shows your open PRs and can be edited or removed.
- See review status, CI checks, labels, comments, and lines added or deleted.
- Read PR details in Paseo, open them on GitHub, or start a workspace chat.
- Get view indicators and a sidebar seedling when new PRs match your views.

## Install

Requires Paseo 0.8+ and the GitHub CLI authenticated with `gh auth login` on the machine running Paseo’s daemon.

```sh
paseo plugin add pmusaraj/paseo-pr-views
```

Open **GitHub PRs** in the sidebar. Choose **New view**, enter a name and query, then save. Queries support GitHub filters, AND/OR, and relative dates such as `created:>@today-30d`.

To start a workspace chat, add the PR’s repository as a Paseo project first. You can review the prompt and model before launching.

## Background checks

Edit a view and enable **Add background check**. For existing views, the checkbox saves immediately.

These optional checks run every 10 minutes while the daemon is running, even with the app closed. The first check establishes a baseline; newly matching PRs then add green dots to the views and add a **🌱** to the **GitHub PRs** sidebar title. The usual PR icon stays unchanged. Indicators clear when the matching results have been displayed. Views with more than 200 matches retain the daemon's indicator because the displayed results do not cover the entire check.

Background checks support views with up to 1,000 results.

The **first five saved views**, in tab order, load up to **200 results each every five minutes while Paseo has focus**, even when the GitHub PRs screen is closed. Views refresh sequentially and share cached results with the screen. Losing app focus pauses this work; an overdue check runs when focus returns. This does not require enabling the optional daemon checks. Additional views still load on selection and retain their optional daemon checks.

After the first load, displayed results stay unchanged until you click **Show updates (N)**. The count includes added, removed, and changed items, such as status, review, CI, labels, or diff statistics. Clicking displays the already-loaded results immediately. **Refresh results** and pull-to-refresh explicitly fetch and display the latest results. Newly added items in any loaded view add **🌱** to the sidebar title until those items are displayed; status-only changes still appear in that view's update count.

The same button handles refreshes and pending updates: it is disabled and reads **Checking for Updates…** during a check, then becomes **Show updates (N)** if changes are ready, or returns to **Refresh results** if nothing changed.

Once the active view has loaded, the next saved view is also preloaded if it has no cached results. This happens only while the app has focus, does not continue through the remaining views, and does not refresh an already-cached next view. Selecting any view shows its cached results immediately and runs a fresh check.

## Credits

Based on [paseo-github-integration](https://github.com/alysnnix/paseo-github-integration). MIT licensed.
