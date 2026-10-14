# claude-git

A Claude Code mod, a fork of [manuel-will/cc-source-control](https://github.com/manuel-will/cc-source-control). The plugin `git` lives in `source-control/`. The README describes what it does.

## Checks

Run these after each change:

```
claude plugin validate ./source-control
claude plugin test ./source-control
```

## Release

Claude Code runs the copy of the mod that it made at install time, not this folder. It updates that copy only when the `version` in `source-control/.claude-plugin/plugin.json` changes, not on each commit.

1. When a change touches the shipped files (`source-control/hooks`, `source-control/types`, `source-control/.claude-plugin`), raise `version` in `source-control/.claude-plugin/plugin.json`.
2. Push to `main`.
3. Update the local installation:

   ```
   claude plugin marketplace update zirkelc
   claude plugin update git@zirkelc
   ```

4. Tell the user to run `/reload-plugins`, so the running sessions load the new version.
