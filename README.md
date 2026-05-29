# Svork

Svelte 5 preprocessors for content files.

- `svelteMarkdown` — Markdown with Svelte interop
- `svelteTypst` — Typst documents compiled to Svelte components

---

## Install

```sh
bun add -D @mralfarrakhan/svork
```

For Typst support, also install the compiler:

```sh
bun add -D @myriaddreamin/typst-ts-node-compiler
```

---

## svelteMarkdown

Markdown files with frontmatter, scripts, components, and inline expressions.

### Setup

```js
import { svelteMarkdown } from "@mralfarrakhan/svork";

export default {
  preprocess: [svelteMarkdown()],
  extensions: [".svelte", ".md"],
};
```

### Usage

```svelte
---
title: Hello
author: Budi
---

<script lang="ts">
  import Badge from "./Badge.svelte";
  const label = "New";
</script>

# {metadata.title}

<Badge text={label} />

Hello, {metadata.author}.
```

Frontmatter is exported as `metadata` from a module script:

```ts
export const metadata = { title: "Hello", author: "Budi" };
```

### Options

```ts
type SvelteMarkdownOptions = {
  extensions?: string[];       // default: [".md"]
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
};
```

Example with plugins:

```js
import rehypeExpressiveCode from "rehype-expressive-code";
import remarkGfm from "remark-gfm";

svelteMarkdown({
  remarkPlugins: [remarkGfm],
  rehypePlugins: [[rehypeExpressiveCode, { themes: ["github-light"] }]],
})
```

### Behavior

- Parses source with Svelte before Markdown so Svelte spans are protected.
- Hides code spans and fenced blocks from the Svelte parse — `{`, `}`, component-like text inside code stay as code.
- Preserves instance scripts, module scripts, components, and inline expression tags.
- Runs `remarkPlugins` and `rehypePlugins` through the unified pipeline.
- Escapes remaining text and attribute braces after rehype plugins run.
- Emits unsupported Svelte syntax as text: `{#if}`, `{#each}`, `{#snippet}`, `{@html}`, `{@render}`, and directives on lowercase elements.
- Falls back to Markdown-only processing with metadata export when Svelte parsing fails.

---

## svelteTypst

Full Typst documents compiled to Svelte components at build time.

### Setup

```js
import { svelteTypst } from "@mralfarrakhan/svork";

export default {
  preprocess: [svelteTypst()],
  extensions: [".svelte", ".typ"],
};
```

### Usage

```typst
#metadata((
  title: "My Post",
  date: "2026-01-01",
)) <frontmatter>

= Section Heading

A paragraph with *bold* and _italic_ text.

== Subsection

More content. A footnote.#footnote[Footnote content here.]
```

Metadata is exported from a module script:

```ts
export const metadata = { title: "My Post", date: "2026-01-01" };
```

### Options

```ts
type SvelteTypstOptions = {
  extensions?: string[];       // default: [".typ"]
  rehypePlugins?: PluggableList;
  compileArgs?: CompileArgs;   // passed to NodeCompiler.create()
};
```

`compileArgs` accepts `fontArgs`, `workspace`, and `inputs` from `@myriaddreamin/typst-ts-node-compiler`.

### Behavior

- Compiles Typst source with `typst-ts-node-compiler` at build time (no runtime dependency).
- Extracts metadata via `#metadata((...)) <frontmatter>` label. Values must be JSON-serializable.
- Runs `rehypePlugins` on the HTML output. Headings are root-level tree children, so plugins like `rehype-sectionize` work correctly.
- Seeds `vfile.data.fm` with extracted metadata before running plugins — plugins can read and augment it.
- Escapes braces in output for Svelte safety.
- No Svelte expressions or components inside `.typ` files — Typst owns the document syntax.
- Heading levels are offset by one: `= Heading` → `<h2>`, `== Heading` → `<h3>`. Typst reserves `<h1>` for the document title.

---

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
