# templates/

Canonical per-tool config. `agent-substrate sync` walks every file under this
directory into the consumer repo at the same relative path, **except** `README.md`
files, which are skipped.

Each rendered file is prepended with a managed header:

```
# Generated from @marcelle-labs/agent-substrate@{version}
# checksum: sha256:<hash>
# DO NOT EDIT — managed by `agent-substrate sync`. Edit the canonical source
# in the substrate (templates/) or this repo's .agents/ override.
```

JSON files receive the same metadata as `_generated` and `_checksum` keys instead.

A consumer may override any canonical file by placing a file at the same relative
path under the consumer repo's own `.agents/` directory; the consumer copy wins.
