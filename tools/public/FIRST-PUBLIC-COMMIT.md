# First public source commit

Run these commands from the private source checkout. This procedure creates a
separate local source history. It does not contact a hosting service, inspect a
remote, fetch history, add a remote, push, tag, merge, or publish a release.

1. Copy `tools/public/personal.example.json` to
   `tools/public/personal.local.json`. The local file is ignored and never exported.
   Fill `names` with all real names, computer usernames, chat handles, friends,
   players and private coaching references that must not ship. Fill `playerIds`,
   `emails` and `vaultMarkers` with any additional values to exclude. Put the permitted
   hold-Space release-notes credit (for example `- name`) in `releaseNoteCredits`;
   it is honoured only for `--notes` files, never for tree files. Git history
   emails and the launcher settings ID are also detected locally. Have the owner
   set `publicAuthor` to their GitHub account name and that account's noreply email
   from Settings / Emails. Never put personal configuration values in a commit.
2. Run `pnpm public:check`, then hand-review player-like names in source and
   fixtures. Run `pnpm public:export`. Both checks must say
   `personal-info check: clean`. Fix findings in the source and re-export; do not
   edit only the exported copy. `--notes file` on the check command can also
   validate release notes, with its narrowly scoped credit exception.
3. In the default sibling folder `../FlashFront-public`, run
   `pnpm install --frozen-lockfile`, `pnpm -r test`, `pnpm -r typecheck`, and
   `pnpm --filter @flashfront/launcher build`. All must pass. The terrain tests
   require the pinned map cache described in the README; the cache is ignored and
   is not included in the export. Resolve that prerequisite before claiming that
   the exported test suite passed.
4. Start from a fresh export for the initial source commit. The helper requires
   empty local history; it refuses any existing commit because safe current files
   cannot prove that older revisions are safe. Choose another export folder if
   necessary, preserving the previous repository. The separate identity audit
   checks metadata and messages across all local refs, not historical file
   contents. Existing remote history and compatibility with it are deliberately
   unverified by this procedure.
5. From the private checkout, run `pnpm public:commit`. It rechecks the exported
   files, uses only the configured noreply identity, and creates a local commit.
   It must print `public commit <hash> ready, not pushed`. Verify locally with
   `git -C ../FlashFront-public log -1 --format=fuller` and
   `git -C ../FlashFront-public remote -v` (the latter should print nothing).
6. Stop at the local commit. Report its hash, file count, privacy check, build and
   test results, and any unverified work for owner review, including confirmation
   of `AGPL-3.0-only`. Publishing is a separate task requiring explicit owner
   authorization.

Optional output paths use `pnpm public:export -- --out <folder>` and
`pnpm public:commit -- --dir <folder>`. Re-export removes the previous export's
files except its `.git` directory. It refuses unsafe or unmarked nonempty folders.
