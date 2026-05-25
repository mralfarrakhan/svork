# Svork

Svork provides `svelteMarkdown`, a Svelte 5 preprocessor for Markdown files that need a small amount of Svelte interop.

It is intended for blog/content pages where Markdown should stay ergonomic while still allowing frontmatter, scripts, components, and inline expressions like `{post.title}`.

## Install

```sh
bun add -D @mralfarrakhan/svork
```

Svork has a peer dependency on Svelte 5.

## Usage

Add the preprocessor to your Svelte config:

```js
import { svelteMarkdown } from "svork";

export default {
  preprocess: [svelteMarkdown()],
  extensions: [".svx", ".md"],
};
```

Then write Markdown with the supported Svelte syntax:

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

Frontmatter is exported as `metadata` from the instance script:

```svelte
export const metadata = {
  title: "Hello",
  author: "Budi",
};
```

## Options

```ts
type SvelteMarkdownOptions = {
  extensions?: string[];
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
};
```

`extensions` defaults to `[".md"]`.

Example with common unified plugins:

```js
import rehypeExpressiveCode from "rehype-expressive-code";
import remarkGfm from "remark-gfm";
import { svelteMarkdown } from "svork";

export default {
  preprocess: [
    svelteMarkdown({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypeExpressiveCode, { themes: ["github-light"] }]],
    }),
  ],
  extensions: [".svelte", ".md"],
};
```

## Behavior

- Parses source with Svelte before Markdown processing so Svelte spans can be protected.
- Hides Markdown code spans and fenced code blocks from the initial Svelte parse, so examples containing `{`, `}`, quotes, or component-like text stay ordinary code.
- Processes the document as one Markdown stream, preserving inline components inside paragraphs and list items.
- Preserves instance scripts, module scripts, Svelte components, and normal inline expression tags.
- Runs user `remarkPlugins` and `rehypePlugins` through the unified pipeline.
- Escapes remaining text and attribute braces after rehype plugins run, so generated highlighter markup remains Svelte-safe.
- Emits unsupported Svelte syntax as text, including `{#if}`, `{#each}`, `{#snippet}`, `{@html}`, `{@render}`, and lowercase-element directives such as `bind:*` or `class:*`.
- Falls back to Markdown processing with metadata export when Svelte parsing fails.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
