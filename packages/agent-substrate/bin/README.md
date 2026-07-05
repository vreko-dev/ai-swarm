# bin/

The `agent-substrate` CLI.

- `agent-substrate.ts` — top-level dispatcher that routes subcommands to their
  implementations. Invoked by `pnpm dlx @marcelle-labs/agent-substrate <command>`.
- `agent-substrate-sync.ts` — renders canonical config into a consumer repo.

Run sync directly:

```sh
npx ts-node bin/agent-substrate-sync.ts --dry-run
```

Run it via the published dispatcher:

```sh
pnpm dlx @marcelle-labs/agent-substrate sync --dry-run
```
