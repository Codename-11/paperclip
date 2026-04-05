# Paperclip Fork — Axiom-Labs

This is [Codename-11's fork](https://github.com/Codename-11/paperclip) of [paperclipai/paperclip](https://github.com/paperclipai/paperclip).

## What This Fork Adds

- **Issue Chat Panel** — Chat with an assigned agent directly from the issue view, with context pills (@issue, @goal, @project, @agent, @system, @deliverables)
- **Deliverables** — First-class tab on issues showing structured agent outputs (files, reports, diffs)
- **File Viewer** — Browse agent workspace files from the UI
- **Agent Onboarding Wizard** — Guided setup for adding new agents
- **Upstream Sync Endpoint** — `/sync-upstream` on deployer sidecar for easy upstream merges

## Staying Current with Upstream

```bash
# Via deployer sidecar (recommended)
curl -X POST http://localhost:3151/sync-upstream \
  -H "Authorization: Bearer $DEPLOYER_SECRET"

# Manually
git fetch upstream
git merge upstream/master
git push origin master
```

## Deployment (Host Native)

```bash
# Service management
systemctl --user start paperclip
systemctl --user stop paperclip
systemctl --user restart paperclip
systemctl --user status paperclip

# Logs
journalctl --user -u paperclip -f

# Deploy latest
curl -X POST http://localhost:3151/deploy \
  -H "Authorization: Bearer $DEPLOYER_SECRET"
```

## Contributing Back Upstream

Features in this fork intended for upstream are tagged `[upstream-candidate]` in commit messages. To open a PR:
1. Create a clean branch from `upstream/master`
2. Cherry-pick or rebase your feature commits
3. Open PR against `paperclipai/paperclip`

## What's Fork-Only

- Axiom-Labs deployment configuration
- Hermes-specific integration details (these live in agent instructions, not the codebase)
