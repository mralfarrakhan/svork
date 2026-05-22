# Svork

Svork provides `svelteMarkdown`, a Svelte 5 preprocessor for writing Markdown files that can include Svelte components, scripts, expressions, raw HTML, and control-flow blocks.

It is intended for blog/content pages where Markdown should stay ergonomic without breaking Svelte syntax such as `{value}`, `<Component />`, `bind:*`, `class:*`, `{#each}`, or module scripts.

## Install

```sh
bun add svork
```

Svork has a peer dependency on Svelte 5.

## Usage

Add the preprocessor to your Svelte config:

```js
import { svelteMarkdown } from "svork";

export default {
  preprocess: [svelteMarkdown()],
  extensions: [".svelte", ".md"],
};
```

Then write Markdown with Svelte syntax:

```svelte
---
title: Hello
author: Budi
---

<script lang="ts">
  import Badge from "./Badge.svelte";

  const items = [{ name: "One" }, { name: "Two" }];
</script>

# {metadata.title}

<Badge text="New" />

{#each items as item}
- {item.name}
{/each}
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

## Behavior

- Parses source with Svelte before Markdown processing so Svelte spans can be protected.
- Processes the document as one Markdown stream, preserving inline components inside paragraphs and list items.
- Preserves instance scripts, module scripts, Svelte expressions, components, directives, and block boundaries.
- Escapes remaining text braces so literal `{` and `}` do not break Svelte compilation.
- Falls back to Markdown processing with metadata export when Svelte parsing fails.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
