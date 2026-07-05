# Audit: External Dependency Enumeration

> List all external dependencies used by affected packages, including version,
> license, and usage pattern.

## Task

**Task ID:** <task-id>
**Date:** <date>

## Dependencies

| Package | Version | License | Used in | Usage pattern |
|---------|---------|---------|---------|---------------|
| <name> | <ver> | <license> | <files> | import/require/dynamic |

## New dependencies introduced

- [ ] None, or list each with justification

## Security review

- [ ] All dependencies are from trusted registries
- [ ] No dependencies with known vulnerabilities (run `npm audit` or equivalent)
- [ ] No dependencies with incompatible licenses

## Verdict

CLEAN / REVIEW NEEDED
