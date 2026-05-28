# logs-skills

Sentry-focused Agent Skills for coding agents. This repo packages reusable
workflows for instrumenting, migrating, and operating logging in JavaScript and
TypeScript projects.

## Skills

| Skill                                                                          | What it helps with                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sentry-logs-migration-javascript`](skills/sentry-logs-migration-javascript/) | Migrate JavaScript/TypeScript from `console.*` or legacy loggers to Sentry Logs with boundary maps, scoped context, wide events, redaction, and linting. |
| [`sentry-setup-logs-javascript`](skills/sentry-setup-logs-javascript/)         | Add operation-level structured Sentry Logs in JavaScript/TypeScript apps with event catalogs, scoped context, sampling, and redaction.                   |

## Get Started

Install the Node tooling:

```bash
pnpm install
```

Install the `skills-ref` validator into a local Python virtual environment:

```bash
pnpm setup:skills-ref
```

Run all checks:

```bash
pnpm check
```

That command prepares the local validator, checks formatting, and validates each
skill under `skills/`.

## Common Tasks

Format Markdown, JSON, YAML, and supported source files:

```bash
pnpm format
```

Check formatting without rewriting files:

```bash
pnpm format:check
```

Validate all skills:

```bash
pnpm validate:skills
```

Count estimated token usage for every `SKILL.md`:

```bash
pnpm tokens:skills
```

Validate one skill directly:

```bash
.venv/bin/skills-ref validate ./skills/sentry-logs-migration-javascript
```

## Add a Skill

Create a new directory under `skills/` with a required `SKILL.md` file:

```text
skills/
  your-skill-name/
    SKILL.md
    agents/openai.yaml
    references/
    assets/
    scripts/
```

Only `SKILL.md` is required. Use `references/` for optional context that should
be loaded on demand, `assets/` for files agents can copy or use, and `scripts/`
for deterministic helpers.

After adding or editing a skill, run:

```bash
pnpm check
```

## Tooling Notes

- Node dependencies are managed with PNPM.
- The Python `skills-ref` dependency is pinned in `requirements-dev.lock`.
- Skill token counts use `tokenx`; validation warns when a `SKILL.md` exceeds
  5,000 estimated tokens.
- `.venv/`, `node_modules/`, `.pnpm-store/`, local environment files, caches,
  and platform noise are ignored by Git.

## License

Skill contents follow the license declared in each skill's `SKILL.md`
frontmatter unless otherwise noted.
