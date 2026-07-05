# Deferred Work Registry

> Items explicitly deferred from implementation. No agent may implement
> these without explicit human approval and a new spec.

| ID | Description | Reason | Date Added | Status |
|----|-------------|--------|------------|--------|
| (none) | | | | |

---

## How to Add Entries

When deferring work, add a row with:

- **ID:** DW-NNN (sequential)
- **Description:** What is being deferred
- **Reason:** Why it is deferred (dependency, priority, complexity)
- **Date Added:** ISO date
- **Status:** Open / Closed

## How to Close Entries

When a deferred item is implemented:

1. Change Status to `Closed`
2. Add `Closed: <date>` and `Commit: <sha>` below the row
3. Reference the spec that implemented it
