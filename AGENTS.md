# Project Agent Guide (`AGENTS.md`)

This guide is designed for AI agents and developers building, modifying, or debugging the **Svork** codebase. It outlines the project's purpose, design, constraints, and architecture.

---

## Project Goal & Overview
* **Purpose**: Provide a lightweight Svelte preprocessor (`svelteMarkdown`) that allows writing blogs using Markdown intermixed with interactive Svelte components, scripts, expression tags, and block structures (like loops/conditionals).
* **Target Environment**: Svelte 5+ applications.
* **Key Benefit**: Natively avoids common pitfalls where standard markdown compilers break on Svelte syntax (like `{}` braces, HTML blocks, or Svelte control flow blocks) by using a robust single-pass compilation pipeline.

---

## Architecture & Processing Pipeline
* **Unified Pipeline**: Uses `unified`, `remark-parse`, `remark-rehype`, `rehype-raw`, and `rehype-stringify` under the hood to process Markdown and raw HTML.
* **Svelte Compiler Integration**: Uses Svelte's official `parse` compiler from `svelte/compiler` to parse the file into an Abstract Syntax Tree (AST) before applying markdown transformations.
* **Processing Steps**:
  1. **Extension Check**: Verifies if the file matches configured extensions (defaults to `.md`).
  2. **Direct Frontmatter Extraction**: Strips YAML frontmatter directly from the raw string using regex before Svelte AST parsing, preventing YAML parsing syntax from tripping the compiler.
  3. **Svelte AST Parsing**: Attempts to parse the clean Svelte code with Svelte. If it fails, falls back to full-text markdown processing.
  4. **Fragment Span Resolution (`getFragmentBounds`)**: Svelte 5 modern AST `Fragment` nodes do not have `start` and `end` coordinates. The utility computes boundaries dynamically by looking at the spans of the first and last child nodes.
  5. **Target Node Collection**: Walk the Svelte modern AST recursively to collect script tags, tags (`ExpressionTag`, `HtmlTag`, `ConstTag`, `DebugTag`, `RenderTag`), block boundaries (`EachBlock`, `IfBlock`, `AwaitBlock`, `SnippetBlock`, `KeyBlock`), and Svelte custom component tags (`Component`).
  6. **Back-to-Front Alphanumeric Substitution**: Sorts target nodes/boundaries by their start index in descending order and replaces them with unique alphanumeric placeholders (e.g. `SVELTESCRIPTSVELTE`, `SVELTEEXPSVELTE`, `SVELTEBLOCKBOUNDARYSVELTE`). This ensures earlier AST index values remain perfectly aligned.
  7. **Single-Pass Compilation**: Processes the entire document as a continuous block through the unified Markdown parser. This natively preserves inline Svelte components inside list items and paragraphs without causing paragraph fragmentation.
  8. **Lone Brace Escaping**: Escapes all remaining lone curly braces (`{` -> `&#123;`, `}` -> `&#125;`). Since Svelte expressions and blocks are protected by placeholders, any remaining curly braces are guaranteed to be lone text braces.
  9. **Restoration & Quote Stripping**: Restores all Svelte block boundaries, script tags, and expressions. Specifically strips double/single quotes around attribute-level expression placeholders to preserve correct Svelte component bindings (e.g. `name={budi}`).
  10. **Metadata Export Injection**: Appends metadata to the instance script block, or prepends a new `<script>` tag if none was present.

---

## Codebase Structure
* `src/index.ts`: The primary entry point containing the preprocessor function `svelteMarkdown` and its core compilation logic.
* `tests/index.test.ts`: Test suite utilizing `vitest` to verify metadata parsing, component inclusion, lists, nested curly brace expressions, and inline components in lists.
* `tsdown.config.js` & `tsconfig.json`: Build configurations using `tsdown` (a TypeScript bundler) to output CJS/ESM modules in `dist/`.
* `package.json`: Holds dependencies (like `svelte`, `js-yaml`, `dedent`, and unified packages) and build scripts.

---

## Crucial Technical Subtleties
* **Nested Curly Brace Stability**: Fully supports expressions with nested braces (such as `{ { theme: 'dark' } }`) by protecting the entire expression block as a single Svelte AST `ExpressionTag` node.
* **Component Boundary Handling**: Self-closing components are replaced as a single placeholder block, while custom components with children are replaced at their start/end boundaries, allowing the inner content to compile cleanly as markdown.
* **Custom Alphanumeric Placeholders**: Placeholders do not use markdown characters (like double underscores `__`), which ensures they are never parsed as bold/italic formatting by the markdown parser.

---

## Development & Testing Workflow
* **Build Command**: `bun run build` / `npm run build` using `tsdown` compiles the library to `/dist`.
* **Testing Command**: `bun test` / `npm test` runs `vitest` to assert compilation correctness.
* **Adding Plugins**: Users can inject additional plugins using the `remarkPlugins` and `rehypePlugins` options in the `SvelteMarkdownOptions` configuration object.
