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
3. Parse the remaining source with `parse(..., { modern: true })` from `svelte/compiler`.
4. Protect Svelte-owned spans with alphanumeric placeholders before Markdown compilation:
   - instance and module scripts
   - normal `ExpressionTag` nodes
   - component boundaries
5. Run the full document through `unified`, `remark-parse`, `remark-rehype`, `rehype-raw`, and `rehype-stringify`.
6. Escape remaining text braces so lone `{` and `}` do not break Svelte compilation.
7. Restore placeholders, stripping quotes around restored attribute expressions where needed.
8. Inject `export const metadata = ...` into an instance script, or prepend a new instance script when none exists.

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
