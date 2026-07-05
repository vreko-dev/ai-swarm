# routing/

`model-routing-table.json` holds the cost/success routing policy consumed by the
`BudgetController` (`selectModel`, `recordOutcome`). It is seeded empty in Phase 1
and populated from observed Dashboard 1 data in Phase 6 — never from assumptions.

See `model-routing-table.schema.json` for the row shape.
