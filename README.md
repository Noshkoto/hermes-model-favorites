# Model Favorites

Star the models you actually use. A star button in the Hermes Desktop composer opens a searchable popover with your **Favorites pinned at the top** and every configured model below, grouped by provider.

- **Right-click any model** to add or remove it from Favorites (a hover star does the same).
- Click a model to switch the focused chat to it. The switch is **session-only**; it never rewrites your default model.
- Guarded switches (data-policy / expensive models) go through Hermes' own confirm dialog.
- Command palette: **Favorite models: toggle current model**.
- Favorites persist in the plugin's own storage, across restarts and profiles. A favorite whose provider isn't configured in the current profile is hidden, not deleted.

## Limits

- Picking a model needs a live chat. On a brand-new draft with no session, the plugin asks you to open or start a chat first (the gateway's `config.set model` requires a session; the core picker stores draft picks in app state the plugin SDK does not expose).
- It adds its own popover next to the composer. It does not modify the built-in model picker, which the plugin SDK has no extension point for.

## Install

On Windows, unzip this folder and run `install.cmd`. It copies `desktop/plugin.js` to `%USERPROFILE%\.hermes\desktop-plugins\model-favorites\plugin.js` (or `%HERMES_HOME%` if that is set). Then in Hermes Desktop press Ctrl+K and run **Reload desktop plugins**.

```bash
hermes plugins install model-favorites
hermes plugins enable model-favorites
```

Local dev: copy `desktop/plugin.js` to `~/.hermes/desktop-plugins/model-favorites/plugin.js`.

Desktop-only, SDK-only (`@hermes/plugin-sdk`, `react`). No tools, hooks, middleware, env vars or network access.

MIT licensed.
