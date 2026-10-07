# dsh-recall-plugin

[简体中文](README.md) | English

![npm](https://img.shields.io/npm/v/dsh-recall-plugin?label=npm&color=cb3837)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)
![Build](https://img.shields.io/badge/pure%20JS-green)

[![DSH](https://img.shields.io/badge/DSH-0.2.1--alpha.1-blue)](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)
![DSH](https://img.shields.io/badge/DSH-Desktop-blue)

Under any message you've sent, click "↶ Recall" — **your workspace files and the conversation history roll back to just before that message was sent**.

As each message is sent, the workspace is first snapshotted into an independent shadow git repository (your project's own git is never touched); a recall restores files from that snapshot and rewinds the conversation through DSH's official `sessions.fork` to the turn boundary before the message, with the original session archived and recoverable. The recalled message's text and attachments are placed back into the input box, ready to edit and resend. Snapshot storage lives under `$DSH_HOME` by default. The main boundary: snapshots are created only **when a message is sent** — messages from before the plugin was enabled have no snapshot and show no recall button.

[Changelog](CHANGELOG.md)

## Table of Contents

- [UI Preview](#ui-preview)
- [Highlights](#highlights)
- [Known Limitations](#known-limitations)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Snapshot Maintenance & Cleanup](#snapshot-maintenance--cleanup)
- [How It Works](#how-it-works)
- [Event Contract (for same-host plugins)](#event-contract-for-same-host-plugins)
- [Local Development (without publishing)](#local-development-without-publishing)
- [License](#license)

## UI Preview

| Recall button | Confirmation panel · file change list |
| --- | --- |
| ![Recall button appears on hover](docs/screenshots/recall-button.png) | ![Confirmation panel · file change list](docs/screenshots/confirm-panel-1.png) |

- Settings · plugin config card (config form / exclusions / snapshot manager, saved changes apply live)

![Settings](docs/screenshots/settings-exclude-2.png)

## Highlights

Abilities with a version in parentheses require that version or later; the rest have no special version requirement.

- **Files + conversation, rolled back together**: recalling isn't just about chat history — files the agent modified go back to their original state too; immune to your project's `.gitattributes` conversion, with byte-level fidelity for line endings and binary content (2.1.1+).
- **Just want a fresh conversation? Leave the files alone** (2.3.24+): the confirmation panel offers a recall-scope choice — the default "Roll back files & conversation" is the full rollback; "Conversation only" keeps your project files byte-for-byte untouched (no safety snapshot either), ideal when you dislike the reply but the file changes are exactly what you want.
- **Never touches your project's own git, and keeps it clean**: snapshots live in an independent shadow git repository — branches, staging area, and uncommitted changes are untouched; storage stays under `$DSH_HOME` regardless of the session's sandbox permission (workspace-write / read-only sessions work as usual), falling back to an in-project `.dsh-recall-snapshots` only when home itself is unwritable.
- **See the list before you act — and change your mind as often as you like**: recall first shows the list of files that will change (modified / restored / deleted); nothing runs until you confirm. After a recall you can recall again to an even earlier point, and files overwritten during a recall always remain recoverable.
- **Resend right after a recall** (2.3.15+): the message's text and attachments (images, files) return to the input box, so you can edit and send again without picking the attachments over.
- **A guarded recall path** (2.0+; auto-rescue 2.1+): a new snapshot after the preview forces a fresh preview; a "pre-rollback" safety snapshot is taken before every recall, a failed rollback is rescued automatically, and a failed rescue gives you a copy-paste-ready manual recovery command.
- **Disk-friendly, self-maintaining**: snapshots use git delta compression and large files are skipped automatically (threshold configurable); periodic lossless `git gc`, session-deletion cleanup, and cleanup by cap or retention age — plus a **workspace → session → snapshot** tree manager on the settings page with search and per-level deletion.
- **Failures speak up and heal** (self-healing 2.1+): failures are classified by root cause (git missing / disk full / permission denied / lock conflict / directory conflict) with actionable guidance (the same fault only bothers you once per 10 minutes; reasons land in the settings card's "Recent errors"); leftover objects are pruned, 3 consecutive failures trigger exponential backoff, concurrent instances yield via heartbeats, and unindexable paths are skipped with a notice instead of failing the whole snapshot (they are neither restored nor deleted on recall).

## Known Limitations

Boundaries accepted by design and edge cases not yet covered — worth checking before you rely on them.

- Snapshots are created **when a message is sent**: messages from before the plugin was enabled have no snapshot and show no recall button.
- Snapshots are **best-effort**: there is a 0.5–1.5 second window between the message arriving and `git add` (on Windows, a single PowerShell start alone costs about 0.4s). If a trivial task finishes editing files inside that window, the snapshot captures the turn's own changes — the file rollback then becomes a no-op (the preview panel reports "0 files will change") while the conversation rollback is unaffected.
- The first user message of a session cannot roll back the conversation (files only), because fork requires an earlier turn boundary.
- Recall cannot be initiated while an agent is running in the target workspace (by design — stop the agent first).
- Supports Windows (PowerShell 5.1/7 + git CLI) and Linux/macOS (bash + git CLI). Windows is thoroughly verified on real machines; Linux has been fully tested on WSL2 (Ubuntu 26.04, bash 5.3 + git 2.53), including Chinese paths, home fallback, session cleanup, and gc; the macOS side is written to be bash 3.2 compatible but has not been tested on real hardware yet.
- Nested git repositories inside the workspace (subdirectories with their own `.git`) cannot be indexed: the snapshot proceeds for everything else (fail-open, with a notice listing the skipped paths), but their contents do not participate in recalls.
- **Directory reparse points** in the workspace (junctions / directory symlinks) are not snapshotted by default: the subtree they point at is not indexed, so its contents do not participate in recalls. This is required on Windows, where git for Windows treats a junction as an ordinary directory and a self-referencing one inflates the index up to Windows' 31-reparse-point path limit (a two-file workspace measured 64 index entries); on POSIX a symlink still enters the snapshot (git records it as a `120000` entry and never recurses). To deliberately snapshot a **benign** junction (pointing outside the workspace, non-self-referencing), append `!path/` (e.g. `!ext-link/`) in the exclusion settings — user rules take effect after machine-generated ones; **never do this for a self-referencing junction** (the explosion vector).
- Extreme cases like filenames containing newlines/TAB are beyond the diff list's parsing capability (negligible probability).
- **Interplay with dsh-routing-suite (progressive tool-disclosure router)**: if you also run its router-standard preset, a recall forks a new session via `sessions.fork`, which resets the router's stage to its default (the tool surface temporarily narrows). Symptoms, root cause and the fix are documented in [docs/routing-interplay.md](docs/routing-interplay.md) (Chinese).

## Installation

Prerequisites:

- git CLI: without it the recall button won't appear (a notice shows at the top of the page); DSH itself keeps running.
- Shell: PowerShell 5.1 / 7 on Windows; bash on Linux/macOS.
- DSH version: `0.1.2-alpha.1` through `0.2.1-alpha.1`; later versions within a verified minor line are admitted automatically, while unverified new minor lines are blocked by the startup compatibility gate (window mechanics in the fold below).
- **0.1.7-alpha.1 is a breaking release** (the shell execution and settings interfaces changed); the plugin ships both seams side by side — the same release works on every 0.1.2–0.1.6 line and on 0.1.7+, with unchanged behaviour on older DSH versions.
- `0.1.1-rc.2` and earlier are not supported: their client runtime lacks the `sessions`/`workspaces`/`uiWorkspace` services, so the plugin UI silently fails to render.

<details>
<summary>peer window mechanics (read before upgrading dsh)</summary>

peerDependencies open a window per minor line, consistent with the `dsh.compatibility.dshReleases` declaration:

```
>=0.1.2-alpha.1 <0.1.3 || >=0.1.3-alpha.1 <0.1.4 || >=0.1.5-alpha.1 <0.1.6 || >=0.1.6-alpha.1 <0.1.7 || >=0.1.7-alpha.1 <0.1.8 || >=0.2.0-rc.1 <0.2.1 || >=0.2.1-alpha.1 <0.3.0
```

Each line is anchored at its first verified version with an upper bound at the next minor (the 0.2.1 window's upper bound is widened to `<0.3.0`, admitting every 0.2 release), so later prereleases/releases within a verified line are admitted without touching the peer declaration. Both the 0.2.0 and 0.2.1 lines need their own tuple: npm's prerelease gate only admits a prerelease from a comparator with the same tuple, so the existing `<0.1.8` segment cannot admit `0.2.0-rc.1`, nor `<0.2.1` admit `0.2.1-alpha.1` (prereleases of later tuples such as 0.2.2 obey the same gate and need their own segment once verified).

</details>

Install & verify:

- Official DSH plugin command (pick the profile for your frontend); installs and auto-mounts into that profile:

  ```powershell
  dsh plugin --profile web add dsh-recall-plugin      # Web UI
  dsh plugin --profile desktop add dsh-recall-plugin  # Desktop
  ```

- Or install directly from git:

  ```powershell
  dsh plugin --profile web add github:limbo947/dsh-recall-plugin
  ```

- Restart the DSH process (pick whichever matches how you start it):

  ```powershell
  dsh web                      # run in the foreground
  pm2 restart <your-dsh-name>  # if managed by pm2
  ```

- **Verify**: after restarting, hard-refresh the page (Ctrl+Shift+R) and hover over any user message sent after the plugin was enabled — the "↶" appearing next to the copy button means it works. No button? Nine times out of ten the DSH process wasn't restarted, or git CLI isn't on PATH.
- **Uninstall** (removes both the dependency and the mount layer):

  ```powershell
  dsh plugin --profile web remove dsh-recall-plugin
  ```

  Snapshot data is kept under `dsh-recall-snapshots/` in home; delete that directory manually if you want it fully gone.

## Usage

A full recall of one user message sent after the plugin was enabled goes like this:

1. Hover over the message (including steering messages inserted while the agent is running) — "↶ Recall" appears to the left of the copy button.
2. Click it → the confirmation panel shows the list of files that will change (modified / restored / deleted), plus a scope choice: "Roll back files & conversation" (default) or "Conversation only" (files stay as they are).
3. Click "Confirm rollback" (or "Confirm conversation recall") → files are restored to their state before that message was sent (files are untouched in conversation-only mode); the view switches to a new session (that message and everything after it is removed), while the original session is archived and can be recovered anytime.

## Configuration

All options can be edited visually in the "**Settings → Plugin Config → Recall Plugin**" card (saved changes apply live, no restart needed), or by restating the insert line under `id: recall` in the profile's `cordis.patch.yml`. Environment variables only override the two gc options and take top priority (fields locked by env are marked and uneditable in the card).

| Option | Default | Description |
| --- | --- | --- |
| `gcSnaps` | 50 | Run `git gc` after this many snapshots accumulate (env `DSH_RECALL_GC_SNAPS` force-overrides) |
| `gcHours` | 24 | Run gc when this many hours have passed since the last one (whichever trigger fires first; env `DSH_RECALL_GC_HOURS`) |
| `maxFileBytes` | 104857600 (100MB) | Files larger than this are neither snapshotted nor touched by recalls |
| `maxSnapshotsPerWorkspace` | 500 | Maximum snapshots kept per workspace; oldest pruned beyond the cap. 0 = unlimited |
| `retentionDays` | 0 | Keep snapshots for this many days; older ones are deleted. 0 = disabled (works independently of the cap) |
| `baseExcludes` | `.git`, `node_modules/`, `.dsh-recall-snapshots/`, `dsh-recall-snapshots/`, `target/`, `dist/`, `build/`, `out/`, `coverage/`, `.next/`, `.nuxt/`, `.output/`, `.cache/`, `.gradle/`, `*.exe`, `*.dll`, `*.pdb`, `*.so`, `*.dylib`, `*.msi`, `*.zip`, `*.7z`, `*.rar`, `*.tar`, `*.tar.gz`, `*.iso` | Base exclusion list (gitignore syntax, lower priority than exclude.txt); excluded large directories are skipped as whole subtrees during snapshot scans. Directory-form entries (e.g. `target/`) mean one more thing: **when a path segment of the workspace root itself matches, snapshots are disabled for that workspace** — patterns are relative to the root, so they can never exclude the root itself (i.e. a session opened inside a build-output directory), and such directories have no rollback value anyway; remove the entry to re-enable |
| `refillDraft` | true | Refill the recalled message (text and attachments) into the input box after a recall |
| `snapshotEnabled` | true | Master snapshot switch (off = no new snapshots; existing snapshots remain recallable) |
| `archiveOriginal` | true | Archive the original session after a recall (off = the original session stays in the session list) |
| `locale` | auto | UI language: `auto` follows the system (`navigator.language` starting with `zh` → Chinese, otherwise English), `zh` / `en` pin it explicitly. See "UI language" below |

The settings card also offers "Restore defaults" (one-click reset of all fields) and a "Recent errors" viewer/clearer.

### UI language

Every UI surface the plugin draws itself (recall button and confirmation panel, toasts, the three settings cards, the snapshot manager tree, recent errors) is bilingual and driven by `locale` — switch it in the "Interface" group of the config card; saving applies immediately (the settings page switches at once, chat-side wording follows on the next page reload).

Two explicit limits: (1) field descriptions rendered by the host's own settings form (i.e. the `Schema.description()` texts) stay in Chinese — the plugin cannot localize those; the plugin's own config card is unaffected. (2) Host-side errors that carry dynamic detail (a failed rollback's rescue outcome, a specific validation reason, a raw exception) are shown verbatim in the panel and "Recent errors" instead of a localized short phrase — we prefer mixed-language output over swallowing the detail you need to troubleshoot.

## Snapshot Maintenance & Cleanup

The plugin manages disk usage automatically — no manual housekeeping needed:

- **Periodic gc**: every 50 snapshots or 24 hours since the last gc (whichever comes first, thresholds configurable), `git gc` runs in the background to pack loose objects — lossless, every snapshot remains recallable. The throttle token lives in `gc.stamp` inside the shadow repository, so restarting DSH does not reset the cycle.
- **Cap & retention**: up to 500 snapshots per workspace by default (oldest pruned beyond the cap), plus optional age-based retention via `retentionDays`; the two triggers work independently and can both be adjusted or disabled in the config card.
- **Session-deletion cleanup**: once a session is permanently deleted (its log gone from disk), the next maintenance pass automatically removes all of its snapshots and frees the space. **Archiving is not deletion** — logs of sessions archived by the recall feature itself still exist, so their snapshots are kept and recoverable from the archive. The check is conservative: a session that is merely cold (not in memory) is never cleaned, and when the log's state cannot be verified, it is left alone.
- **User-defined exclusions**: open the "**Settings → Plugin Config → Recall Plugin**" card (collapsed by default; click the header to expand) to edit snapshot exclusions visually — type a path or pattern and press Enter to add it, one-click append for common patterns (`dist/`, `*.log`, `.env`, …), and saved changes take effect on the very next snapshot/recall, no restart needed. Alternatively, edit `$DSH_HOME/dsh-recall-snapshots/exclude.txt` directly (or `~/.dsh/dsh-recall-snapshots/exclude.txt` when unset; UTF-8): one gitignore-style pattern per line, lines starting with `#` are comments — both paths edit the same configuration. For example:

  ```gitignore
  # keep build artifacts out of snapshots
  dist/
  build/
  *.log
  ```

  This applies to all projects (when home is unwritable and a workspace falls back to in-project storage, it gets its own independent exclusion config, listed as a separate card in the settings tab). New exclusions only affect future snapshots; **when recalling to an earlier snapshot, files that weren't excluded at that time are still restored** (returning to the state as it was — that's exactly what recall means). To fully purge a directory that already made it into snapshots, manually delete the corresponding hash directory under `dsh-recall-snapshots/` in home.
- **Tree-view snapshot manager**: open "**Settings → Plugin Config → Recall Plugin → Snapshot Manager**" for a three-level tree — workspace (folder name) → session (session title, recall chains grouped into version families) → snapshot (time + message content summary, hover for the full content). Search and "load more" are supported; workspace and session nodes expand/collapse; every level has a delete button on its right, with a confirmation before deletion — deleting a workspace clears all of its snapshots, deleting a session clears all of that session's snapshots, deleting a leaf removes just that single snapshot; a confirmed "Delete all" button sits at the top.

## How It Works

When each user message is sent (before the agent touches any files), the workspace is snapshotted into an independent shadow git repository; on recall, a "pre-rollback" safety snapshot is taken first, then files are restored via `git archive` and the conversation is rewound through DSH's official `sessions.fork` mechanism. Binary- and line-ending-safe, and your project's own git state is never touched.

- Snapshot storage: `dsh-recall-snapshots/<SHA256(project absolute path)>/` under home, containing the shadow git repository (`git/`, tags named `snap-<messageID>`), the index file `index.json` (message ID → snapshot time / session), and the recall chain `lineage.json`. Scripts run via PowerShell on Windows and bash on Linux/macOS (selected automatically by platform).
- **Works on Windows even when the host configures its shell as bash** (2.3.22+): DSH's shell is registered by the profile, and on win32 you can enable only `bash-sandbox` — the PowerShell templates would then be executed by bash and fail across the board. Before running its first command the plugin probes whether the executor can run pwsh (a sentinel command); if it turns out to be bash, the plugin switches to spawning the system PowerShell 5.1 directly, so snapshots and recall keep working. Deployments where `ctx.shell` is pwsh behave exactly as before (one probe, then everything as usual).
- To browse historical snapshots directly:

  ```powershell
  git --git-dir="<store>\git\.git" tag -l
  git --git-dir="<store>\git\.git" ls-tree -r --name-only snap-<messageID>
  ```

- The format and version-compatibility rules for every file in the store directory (index, recall chain, format marker, intent journal, etc.) live in [docs/format.md](docs/format.md).

## Event Contract (for same-host plugins)

When a recall reaches its terminal state, the plugin broadcasts two public cordis events (2.4.8+). Any plugin on the same host can subscribe — for example, a long-term-memory plugin can purge memories written by the recalled turn:

```js
// inside a same-host plugin
ctx.on('dsh-recall/complete', (e) => {
  if (e.chatReverted) memory.purgeTurn(e.root, e.sessionId, e.cutSeq)
})
ctx.on('dsh-recall/failed', (e) => {
  if (e.stage === 'fork') log.warn('files reverted but the conversation did not', e)
})
```

`dsh-recall/complete` — recall succeeded:

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | `1` | Contract version (see evolution rules below) |
| `sessionId` | `string` | The original session being recalled |
| `childSessionId` | `string \| null` | The forked session; `null` for a files-only recall |
| `scope` | `'both' \| 'session-only'` | Recall scope |
| `cutSeq` | `number \| null` | Conversation cut point; `null` when the message was the session's first |
| `messageId` | `string` | ID of the recalled message (snapshot primary key) |
| `root` | `string \| null` | Workspace root path; `null` if host resolution failed |
| `count` | `number` | Number of files reverted (always `0` for `session-only`) |
| `chatReverted` | `boolean` | Whether the conversation actually reverted (downstream gate, see below) |
| `archiveRequested` | `boolean` | Whether archiving of the original session was initiated (fire-and-forget, not completion) |
| `time` | `number` | When the host received the report (ms) |

`dsh-recall/failed` — recall failed:

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | `1` | Contract version |
| `stage` | `'execute' \| 'fork'` | Failure stage: file revert rejected/errored, or files reverted but conversation revert failed |
| `sessionId` | `string \| null` | The original session being recalled |
| `messageId` | `string` | ID of the recalled message |
| `scope` | `'both' \| 'session-only'` | Recall scope |
| `cutSeq` | `number \| null` | Cut point known to the client (may not have been used) |
| `root` | `string \| null` | Workspace root path; `null` if resolution failed |
| `code` | `string?` | Only for `stage='execute'`: host error code (`AGENT_BUSY` / `NO_SNAPSHOT` / …) |
| `error` | `string` | Error description |
| `time` | `number` | When the host received the report (ms) |

Semantics every consumer should know:

- **Only terminal states emit events.** The "preview went stale, auto re-previewing" (STALE) path is an intermediate state and emits nothing; neither does a cancelled/closed panel.
- **A fork failure emits `failed(stage:'fork')` and never `complete`** — at that point files are reverted but the conversation is not; emitting `complete` would make downstream purge memories of a still-intact conversation. Gate "the conversation actually reverted" on `complete.chatReverted` (a files-only `complete` has `chatReverted:false`).
- For `failed(stage:'execute')` originating from an exception (rather than a guard rejection), **whether files were reverted is unknown** — treat it conservatively.
- Retries/repeated recalls may emit multiple events for the same `(sessionId, messageId, cutSeq)` triple; downstream should deduplicate on it.
- Payloads contain no message bodies — only IDs / seq / paths — and are visible only to plugins on the same host.

Versioning: shipped as a stable public contract from day one (not experimental). Additive changes ride minor releases; breaking changes ride a major release with `version` bumped to `2`, so downstream can branch on it.

Version skew: an old plugin frontend (<2.4.8) never reports, so events never fire; a new frontend with an old host (<2.4.8) gets a missing endpoint and silently ignores it — recall itself is unaffected.

## Local Development (without publishing)

Point the profile's dependency for this package at your clone via `link:`; DSH loads the built `lib/` artifacts from the workspace (source lives in `src/`), so run `npm run build` after editing `src/`, then restart DSH — no copying or publishing needed:

```powershell
# 1. Edit $env:USERPROFILE\.dsh\profiles\web\package.json:
#    in "dependencies", set "dsh-recall-plugin": "link:<path-to-your-clone>\dsh-recall-plugin"
#    "dsh.profile.bundles" should already contain "dsh-recall-plugin" (run the official install command once)
# 2. Install in the profile directory and restart
cd $env:USERPROFILE\.dsh\profiles\web
pnpm install
# 3. Restart DSH and hard-refresh the page (Ctrl+Shift+R)
```

Note: all source lives in `src/` (host in `src/host/`, browser side in `src/client/`, shared types in `src/types/`); `lib/` is a pure build-output directory — `npm run build` generates it via esbuild (per-file host transpilation plus the `lib/client.js` bundle), and the artifacts are committed with the source. **You must run `npm run build` after changing any `src/` file**, otherwise the stale artifacts keep running (CI enforces artifact freshness).

### Tests

- `npm test`: pure-logic unit tests (vitest, 39 files / 497 cases, no DSH dependency, runs identically in CI and locally) — config parsing, snapshot parsers, rescue orchestration, error classification, the disk-format guard, the recall intent journal, recall terminal-event payload assembly, i18n dictionaries plus a missing-key scan, script-template same-name-export contract, shell execution dual-channel split and failure grading, settings bridge across both generations, client pure functions, published-package layout, snapshot index persistence, storage caps and retention, etc.;
- `npm run test:client`: client component tests (vitest + jsdom, 6 files / 90 cases, runs in CI) — the recall node main chain (preview→execute→fork→refill) and terminal-event reporting, snapshot-manager tree and delete flows, config/exclude card error paths, the logger switch matrix, and the zh/en rendering chains; assertions pin behaviour and structure only (className / aria / request payloads), never literal copy;
- `npm run test:probe`: official-API field probes (requires a local dsh installation; **must run after any dsh upgrade**) — pins fields like `renderMessageImages`/`node`/`cwd`, `atSeq`/`increaseTitle` and the fork-cut anchors of `sessions.fork`, `listSessions` record shape, `AgentRegistry`, the shell execution seam (`execute`/`ShellExecution.result`), the settings surface (`SettingsForms`/profile entry id/volatile gate) plus `loader/volatile-update` and the `Fiber.entry` shape, and goes red on violation;
- `npm run verify:host`: assembly gate (requires a local dsh installation) — boots the plugin with a real cordis context in two passes (legacy settings stub and a modern-face-only stub), asserting inject declarations, endpoint registration, Config schema, teardown cleanliness and settings-face dispatch, catching assembly regressions before release;
- `npm run build`: full host+client build (mandatory after any `src/` change); `npm run check:dsh`: dsh version inspection (pre-release).
- CI (GitHub Actions) runs `npm ci --legacy-peer-deps` + `npm run typecheck` + `npm test` + `npm run test:client` + unified artifact-freshness check (`npm run build && git diff --exit-code lib/`; probes and the assembly gate only run on machines with dsh).

## License

MIT
