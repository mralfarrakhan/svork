# Svork Agent Guide

Svork is a Svelte 5 preprocessor library with two preprocessors: `svelteMarkdown` (`src/markdown.ts`) and `svelteTypst` (`src/typst.ts`).

## svelteMarkdown

Converts `.md` files into Svelte-compatible markup.

- Supports Markdown mixed with YAML frontmatter, Svelte scripts, Svelte components, and normal inline expression tags such as `{post.title}`.
- Extracts YAML frontmatter and exports it as `metadata` from a module script (`<script module lang="ts">`).
- Treats unsupported Svelte syntax as Markdown text. This includes block/control syntax such as `{#if}`, `{#each}`, `{#snippet}`, `{@html}`, `{@render}`, and Svelte directives on lowercase HTML elements.
- Accepts additional `remarkPlugins` and `rehypePlugins`.

### Markdown Pipeline

1. Match configured extensions, defaulting to `.md`.
2. Strip YAML frontmatter before Svelte parsing.
3. Mask Markdown code spans and fenced code blocks with same-length whitespace before Svelte parsing. Keeps code examples from being collected as Svelte syntax while preserving source offsets.
4. Parse the remaining source with `parse(..., { modern: true })` from `svelte/compiler`.
5. Protect Svelte-owned spans with `<svork-placeholder>` elements (for Expressions and ComponentBoundaries) or alphanumeric token strings (for scripts) before Markdown compilation:
   - instance and module scripts
   - `ExpressionTag` nodes
   - component open/close boundaries
   - `RegularElement` nodes with Svelte-specific attributes (preserved as escaped text)
6. Run the full document through `unified`, `remark-parse`, configured `remarkPlugins`, `remark-rehype`, `rehype-raw`, configured `rehypePlugins`, `escapeBracesPlugin`, and `rehype-stringify`.
7. Escape remaining text and attribute braces via `escapeBracesPlugin` (in `src/shared.ts`) after user rehype plugins run, so generated markup from code highlighters remains Svelte-safe.
8. Restore placeholders, stripping paragraph wrappers added by the Markdown compiler where needed. Strip quotes around restored attribute expressions.
9. Inject `export const metadata = ...` into a module script, or prepend a new `<script module lang="ts">` when none exists. Merges any `vfile.data.fm` fields injected by remark/rehype plugins (e.g. reading time).

If Svelte parsing fails, the fallback still runs Markdown processing, escapes lone braces, and exports frontmatter metadata.

## svelteTypst

Converts `.typ` files into Svelte components using `@myriaddreamin/typst-ts-node-compiler` (optional peer dependency).

- Compiles Typst source to HTML via `NodeCompiler`.
- Extracts metadata from a `#metadata((...)) <frontmatter>` label in the Typst source.
- Unwraps Typst's outer `<div>` wrapper from the body so headings are root-level children (required for plugins like `rehype-sectionize`).
- Accepts `rehypePlugins` and `compileArgs` (passed to `NodeCompiler.create`).

### Typst Pipeline

1. Match configured extensions, defaulting to `.typ`.
2. Shadow the file at its real path via `c.addSource` so relative imports and images resolve correctly.
3. Compile Typst source to an HTML document with `c.compileHtml`.
4. Query `<frontmatter>` label for metadata via `c.query`.
5. Render as HTML with `c.tryHtml` and parse the body into a hast tree via `parse5` + `hast-util-from-parse5`.
6. Run the hast tree through configured `rehypePlugins`, `escapeBracesPlugin`, and `rehype-stringify`.
7. Wrap output in `<script module lang="ts">` exporting `metadata`.

## Shared Utilities (`src/shared.ts`)

- `escapeBracesPlugin`: rehype plugin that escapes `{` and `}` in text nodes and attribute values (skipping `<script>` and `<style>`) so generated HTML is Svelte-safe.
- `revertDoubleEscapedBraces`: fixes double-escaping of `&#123;`/`&#125;` produced by `rehype-stringify` after `escapeBracesPlugin` runs.

## Files

- `src/index.ts`: re-exports from `./markdown` and `./typst`.
- `src/markdown.ts`: `svelteMarkdown` preprocessor implementation.
- `src/typst.ts`: `svelteTypst` preprocessor implementation.
- `src/shared.ts`: `escapeBracesPlugin` and `revertDoubleEscapedBraces`.
- `tests/markdown.test.ts`: behavior tests for `svelteMarkdown` with Vitest and Svelte compiler checks.
- `tests/typst.test.ts`: behavior tests for `svelteTypst`.
- `tsdown.config.js`: library build.
- `package.json`: package metadata and Bun scripts.

## Development

Use Bun for this repo.

- Test: `bun run test`
- Typecheck: `bun run typecheck`
- Build: `bun run build`

Cover parser-sensitive fixes with tests that compile the generated Svelte output via `svelte/compiler`.
