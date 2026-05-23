# Svork Agent Guide

Svork is a Svelte 5 Markdown preprocessor. The public entry point is `svelteMarkdown` in `src/index.ts`.

## What It Does

- Converts `.md` files into Svelte-compatible markup.
- Supports Markdown mixed with YAML frontmatter, Svelte scripts, Svelte components, and normal inline expression tags such as `{post.title}`.
- Extracts YAML frontmatter and exports it as `metadata` from an instance script.
- Treats unsupported Svelte syntax as Markdown text. This includes block/control syntax such as `{#if}`, `{#each}`, `{#snippet}`, `{@html}`, `{@render}`, and Svelte directives on lowercase HTML elements.
- Accepts additional `remarkPlugins` and `rehypePlugins`.

## Core Pipeline

1. Match configured extensions, defaulting to `.md`.
2. Strip YAML frontmatter before Svelte parsing.
3. Mask Markdown code spans and fenced code blocks with same-length whitespace before Svelte parsing. This keeps code examples from being collected as Svelte syntax while preserving source offsets.
4. Parse the remaining source with `parse(..., { modern: true })` from `svelte/compiler`.
5. Protect Svelte-owned spans with alphanumeric placeholders before Markdown compilation:
   - instance and module scripts
   - normal `ExpressionTag` nodes
   - component boundaries
6. Run the full document through `unified`, `remark-parse`, configured `remarkPlugins`, `remark-rehype`, `rehype-raw`, configured `rehypePlugins`, and `rehype-stringify`.
7. Escape remaining text and attribute braces after user rehype plugins run, so generated markup from code highlighters remains Svelte-safe.
8. Restore placeholders, stripping quotes around restored attribute expressions where needed.
9. Inject `export const metadata = ...` into an instance script, or prepend a new instance script when none exists.

If Svelte parsing fails, the fallback still runs Markdown processing, escapes lone braces, and exports frontmatter metadata.

## Files

- `src/index.ts`: implementation.
- `tests/index.test.ts`: behavior tests with Vitest and Svelte compiler checks.
- `tsdown.config.js`: library build.
- `package.json`: package metadata and Bun scripts.

## Development

Use Bun for this repo.

- Test: `bun run test`
- Typecheck: `bun run typecheck`
- Build: `bun run build`

Keep changes focused on the preprocessor behavior and cover parser-sensitive fixes with tests that compile the generated Svelte output.
