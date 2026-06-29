import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import rehypeShiki from "@shikijs/rehype";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { svelteMarkdown } from "../src";

describe("svelteMarkdown", () => {
  it("exact", async () => {
    const source = `---
title: Boo Dee
author: Budi
---

<script lang="ts">
    import Budi from 'Budi.svelte';
    const budi = "budi";
    import Badrul from 'Svelte.svelte';
</script>

<Hudi name={budi} />

<Badrul>
This is content
</Badrul>

# Hello, { budi }!

This is a test file

# Inventory List

{#each items as item}
- {item.name} - {item.price}
{/each}
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "somefile.md",
    });

    // We verify the important structural characteristics of the generated output:
    // 1. Script block correctly preserved and metadata injected
    expect(result?.code).toContain(`export const metadata = {"title":"Boo Dee","author":"Budi"};`);
    expect(result?.code).toContain(`import Budi from 'Budi.svelte';`);

    // 2. Expressions preserved correctly
    expect(result?.code).toContain(`<h1>Hello, { budi }!</h1>`);

    // 3. Components preserved beautifully with correct case and braces
    expect(result?.code).toContain(`<Hudi name={budi} />`);
    expect(result?.code).toContain(`<Badrul>\nThis is content\n</Badrul>`);

    // 4. Svelte block boundaries are emitted as text, not preserved as Svelte syntax.
    expect(result?.code).toContain(`&#123;#each items as item&#125;`);
    expect(result?.code).toContain(`&#123;/each&#125;`);
    expect(() => compile(result?.code ?? "", { filename: "exact.svelte" })).not.toThrow();
  });

  it("prepends script module for metadata when only an instance script is present", async () => {
    const source = `---
title: My Article
---

<script lang="ts">
import Card from './Card.svelte';
const count = 0;
</script>

# {count}
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "instance-only.md",
    });

    // Metadata lives in its own <script module> — a proper ES module named export,
    // accessible via import.meta.glob without instantiating the component.
    expect(result?.code).toContain(
      `<script module lang="ts">\nexport const metadata = {"title":"My Article"};\n</script>`,
    );
    // Instance script is preserved separately with its imports intact.
    expect(result?.code).toContain(
      `<script lang="ts">\nimport Card from './Card.svelte';\nconst count = 0;\n</script>`,
    );
    // Cross-contamination guards.
    expect(result?.code).not.toContain(`<script module lang="ts">\nimport Card`);
    expect(result?.code).not.toContain(`<script lang="ts">\nexport const metadata`);
    expect(() => compile(result?.code ?? "", { filename: "instance-only.svelte" })).not.toThrow();
  });

  it("does not wrap block components in <p> tags", async () => {
    const source = `<script>
import Card from "./Card.svelte";
import Badge from "./Badge.svelte";
</script>

<Card title="Hello" />

<Badge>
Some content
</Badge>
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "no-p-wrap.md",
    });

    // Self-closing component must not be wrapped in <p>
    expect(result?.code).not.toMatch(/<p>\s*<Card/);
    expect(result?.code).toContain(`<Card title="Hello" />`);

    // Component with children: open and close tags must not be wrapped in <p>
    expect(result?.code).not.toMatch(/<p>\s*<Badge/);
    expect(result?.code).not.toMatch(/<p>\s*<\/Badge/);
    expect(result?.code).toContain(`<Badge>`);
    expect(result?.code).toContain(`</Badge>`);

    expect(() => compile(result?.code ?? "", { filename: "no-p-wrap.svelte" })).not.toThrow();
  });

  it("component", async () => {
    const source = `<script>
import Budi from '../Budi.svelte';

const budi = "budi";
</script>

<Budi name={budi}>
This is {budi}
</Budi>
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "somefile.md",
    });

    expect(result?.code).toContain(`export const metadata = {};`);
    expect(result?.code).toContain(`<Budi name={budi}>\nThis is {budi}\n</Budi>`);
  });

  it("nested expressions", async () => {
    const source = `The configuration is { { theme: 'dark', active: true } }`;
    
    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "nested.md",
    });

    expect(result?.code).toContain(`The configuration is { { theme: 'dark', active: true } }`);
  });

  it("inline components in lists", async () => {
    const source = `- Item with <Badge text="New" /> inline component.`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "inline.md",
    });

    // The list is processed as a single continuous block, preserving the inline component without fragmentation!
    expect(result?.code).toContain(`<ul>\n<li>Item with <Badge text="New" /> inline component.</li>\n</ul>`);
  });

  it("treats svelte directives on regular elements as text", async () => {
    const source = `<script lang="ts">
let name = "Budi";
let ok = true;
const save = () => {};
</script>

<input bind:value={name} class:active={ok} on:click={save} />
<div class={name}>Hello</div>
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "directives.md",
    });

    expect(result?.code).toContain(
      `&lt;input bind:value=&#123;name&#125; class:active=&#123;ok&#125; on:click=&#123;save&#125; /&gt;`,
    );
    expect(result?.code).toContain(`&lt;div class=&#123;name&#125;&gt;Hello&lt;/div&gt;`);
    expect(() => compile(result?.code ?? "", { filename: "directives.svelte" })).not.toThrow();
  });

  it("preserves inline expressions inside plain html text", async () => {
    const source = `<script>
const name = "Budi";
</script>

<div class="note">Hello {name}</div>
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "plain-html.md",
    });

    expect(result?.code).toContain(`<div class="note">Hello {name}</div>`);
    expect(() => compile(result?.code ?? "", { filename: "plain-html.svelte" })).not.toThrow();
  });

  it("treats svelte control and special tags as text", async () => {
    const source = `<script>
const ok = true;
const content = "<strong>Hi</strong>";
</script>

{#if ok}
{@html content}
{:else}
{@render child()}
{/if}
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "control.md",
    });

    expect(result?.code).toContain(`&#123;#if ok&#125;`);
    expect(result?.code).toContain(`&#123;@html content&#125;`);
    expect(result?.code).toContain(`&#123;:else&#125;`);
    expect(result?.code).toContain(`&#123;@render child()&#125;`);
    expect(result?.code).toContain(`&#123;/if&#125;`);
    expect(() => compile(result?.code ?? "", { filename: "control.svelte" })).not.toThrow();
  });

  it("preserves component props with valid js expressions", async () => {
    const source = `<script lang="ts">
import Card from "./Card.svelte";

const post = { title: "Hello" };
</script>

<Card title={post.title} options={{ theme: "dark", count: 2 }} />
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "component-props.md",
    });

    expect(result?.code).toContain(
      `<Card title={post.title} options={{ theme: "dark", count: 2 }} />`,
    );
    expect(() => compile(result?.code ?? "", { filename: "component-props.svelte" })).not.toThrow();
  });

  it("injects metadata into existing module scripts", async () => {
    const source = `---
title: Module Post
---

<script module>
export const prerender = true;
</script>

# Hello
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "module.md",
    });

    expect(result?.code).toContain(
      `<script module>\nexport const metadata = {"title":"Module Post"};\n\nexport const prerender = true;\n</script>`,
    );
    expect(result?.code).not.toContain(`<script lang="ts">`);
    expect(() => compile(result?.code ?? "", { filename: "module.svelte" })).not.toThrow();
  });

  it("treats single-quoted context module scripts as module scripts", async () => {
    const source = `---
title: Context Module Post
---

<script context='module'>
export const csr = false;
</script>

# Hello
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "context-module.md",
    });

    expect(result?.code).toContain(
      `<script context='module'>\nexport const metadata = {"title":"Context Module Post"};\n\nexport const csr = false;\n</script>`,
    );
    expect(result?.code).not.toContain(`<script lang="ts">`);
    expect(() =>
      compile(result?.code ?? "", { filename: "context-module.svelte" }),
    ).not.toThrow();
  });

  it("keeps fallback output metadata-aware and escapes lone braces", async () => {
    const source = `---
title: Fallback Post
---

Text { only
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "fallback.md",
    });

    expect(result?.code).toContain(
      `export const metadata = {"title":"Fallback Post"};`,
    );
    expect(result?.code).toContain(`<p>Text &#123; only</p>`);
    expect(() => compile(result?.code ?? "", { filename: "fallback.svelte" })).not.toThrow();
  });

  it("escapes braces inside code fences", async () => {
    const source = "```\nconst a = { test: true }\n```";

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "code.md",
    });

    expect(result?.code).toContain("const a = &#123; test: true &#125;");
    expect(() => compile(result?.code ?? "", { filename: "code.svelte" })).not.toThrow();
  });

  it("treats inline code as markdown code, not svelte syntax", async () => {
    const source = `<script>
import Card from "./Card.svelte";
const x = "value";
</script>

Use \`<Card value={x} />\` as text.

<Card value={x} />
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "inline-code.md",
    });

    expect(result?.code).toContain(`<code>&#x3C;Card value=&#123;x&#125; /></code>`);
    expect(result?.code).toContain(`<Card value={x} />`);
    expect(() => compile(result?.code ?? "", { filename: "inline-code.svelte" })).not.toThrow();
  });

  it("preserves braces inside script tags", async () => {
    const source = `<script>\nconst x = { a: 1 };\n</script>\n# Title`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "script.md",
    });

    expect(result?.code).toContain("const x = { a: 1 };");
    expect(() => compile(result?.code ?? "", { filename: "script.svelte" })).not.toThrow();
  });

  it("does not collide with literal placeholder-like tokens", async () => {
    const source = `SVELTE_FAKE_TOKEN\n\n<script>\nconst budi = 'budi';\n</script>\n\n# Hello { budi }`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "collision.md",
    });

    expect(result?.code).toContain("SVELTE_FAKE_TOKEN");
    expect(result?.code).toContain("{ budi }");
  });

  it("works with remark-gfm and rehype-expressive-code output", async () => {
    const source = `---
title: Plugin Post
---

| Name | Value |
| ---- | ----- |
| title | {metadata.title} |

\`\`\`ts title="demo.ts"
const label = "{notSvelte}";
const options = { theme: "dark" };
\`\`\`
`;

    const result = await svelteMarkdown({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypeExpressiveCode, { themes: ["github-light"] }]],
    }).markup?.({
      content: source,
      filename: "plugins.md",
    });

    expect(result?.code).toContain("<table>");
    expect(result?.code).toContain("{metadata.title}");
    expect(result?.code).toContain("expressive-code");
    expect(result?.code).toContain("&#123;notSvelte&#125;");
    expect(result?.code).toContain("&#123; theme:");
    expect(() => compile(result?.code ?? "", { filename: "plugins.svelte" })).not.toThrow();
  });

  it("escapes braces generated by late rehype plugins", async () => {
    const rehypeGeneratedBraces = () => (tree: any) => {
      tree.children.push({
        type: "element",
        tagName: "div",
        properties: {
          title: "{generatedAttribute}",
        },
        children: [{ type: "text", value: "{generatedText}" }],
      });
    };

    const result = await svelteMarkdown({
      rehypePlugins: [rehypeGeneratedBraces],
    }).markup?.({
      content: "# Hello",
      filename: "late-rehype.md",
    });

    expect(result?.code).toContain(`title="&#123;generatedAttribute&#125;"`);
    expect(result?.code).toContain(`>&#123;generatedText&#125;</div>`);
    expect(() => compile(result?.code ?? "", { filename: "late-rehype.svelte" })).not.toThrow();
  });

  it("keeps rehype heading slugs readable when headings contain svelte syntax", async () => {
    const source = `---
title: Plugin Post
---

<script>
import Badge from "./Badge.svelte";
</script>

## Hello {metadata.title} <Badge />
`;

    const result = await svelteMarkdown({
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
      ],
    }).markup?.({
      content: source,
      filename: "heading-links.md",
    });

    expect(result?.code).toContain(`id="hello-metadata-title-badge"`);
    expect(result?.code).toContain(`href="#hello-metadata-title-badge"`);
    expect(result?.code).toContain(`Hello {metadata.title} <Badge />`);
    expect(result?.code).not.toContain("SVELTE_EXPRESSION");
    expect(result?.code).not.toContain("svork-placeholder");
    expect(() => compile(result?.code ?? "", { filename: "heading-links.svelte" })).not.toThrow();
  });

  it("supports remark-gfm footnotes with live expressions and code braces", async () => {
    const source = `---
title: Footnote Post
---

Here is a footnote.[^1]

[^1]: Footnote for {metadata.title} and \`{literal}\`.
`;

    const result = await svelteMarkdown({
      remarkPlugins: [remarkGfm],
    }).markup?.({
      content: source,
      filename: "footnotes.md",
    });

    expect(result?.code).toContain(`data-footnote-ref`);
    expect(result?.code).toContain(`id="user-content-fn-1"`);
    expect(result?.code).toContain(`Footnote for {metadata.title}`);
    expect(result?.code).toContain(`<code>&#123;literal&#125;</code>`);
    expect(() => compile(result?.code ?? "", { filename: "footnotes.svelte" })).not.toThrow();
  });

  it("works with @shikijs/rehype: highlights code and escapes generated braces", async () => {
    const source = `---
title: Shiki Post
---

<script>
const greeting = "Hello";
</script>

# {greeting}

Here is some code:

\`\`\`ts
const options = { theme: "dark", active: true };
function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

And a plain expression: {greeting}
`;

    const result = await svelteMarkdown({
      rehypePlugins: [
        [rehypeShiki, { theme: "github-light" }],
      ],
    }).markup?.({ content: source, filename: "shiki.md" });

    // 1. Shiki actually ran: code block is wrapped in highlighted spans
    expect(result?.code).toContain("<span");
    // Shiki wraps output in a <pre><code> inside a <shiki-> or plain element
    expect(result?.code).toMatch(/<pre[^>]*>[\s\S]*<code/);

    // 2. Braces inside the highlighted code are escaped — shiki emits raw text
    //    like "{ theme..." which our escapeBracesPlugin must convert to &#123;
    expect(result?.code).toContain("&#123;");
    expect(result?.code).not.toMatch(/<code[\s\S]*?\{(?!#|\/)[\s\S]*?<\/code>/);

    // 3. Svelte expression outside code block is untouched
    expect(result?.code).toContain("{greeting}");

    // 4. Script block and metadata survive
    expect(result?.code).toContain(`export const metadata = {"title":"Shiki Post"};`);
    expect(result?.code).toContain(`const greeting = "Hello";`);

    // 5. Final output is valid Svelte
    expect(() => compile(result?.code ?? "", { filename: "shiki.svelte" })).not.toThrow();
  });

  it("merges vfile.data.fm injected by remark plugins into exported metadata", async () => {
    const remarkInjectFm = () => (_tree: any, file: any) => {
      file.data.fm = { ...(file.data.fm ?? {}), readingTime: "5 min read" };
    };

    const source = `---
title: My Post
---

This is a test article with enough words to measure.
`;

    const result = await svelteMarkdown({
      remarkPlugins: [remarkInjectFm],
    }).markup?.({
      content: source,
      filename: "reading-time.md",
    });

    expect(result?.code).toContain(`export const metadata = {"title":"My Post","readingTime":"5 min read"};`);
    expect(() => compile(result?.code ?? "", { filename: "reading-time.svelte" })).not.toThrow();
  });

  describe("importImages", () => {
    it("transforms local markdown image into svelte import", async () => {
      const source = `<script>
import Card from "./Card.svelte";
</script>

![cat](./cat.png)
`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "local-image.md",
      });

      expect(result?.code).toContain(`import catPng from './cat.png';`);
      expect(result?.code).toContain(`<img src={catPng} alt="cat">`);
      expect(result?.code).toContain(`import Card from "./Card.svelte";`);
      expect(() => compile(result?.code ?? "", { filename: "local-image.svelte" })).not.toThrow();
    });

    it("transforms images with kebab-case paths", async () => {
      const source = `![My Photo](./assets/my-cat-photo.png)`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "kebab-image.md",
      });

      expect(result?.code).toContain(`import myCatPhotoPng from './assets/my-cat-photo.png';`);
      expect(result?.code).toContain(`<img src={myCatPhotoPng} alt="My Photo">`);
      expect(() => compile(result?.code ?? "", { filename: "kebab-image.svelte" })).not.toThrow();
    });

    it("passes remote URLs through unchanged", async () => {
      const source = `![remote](https://example.com/cat.png)`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "remote-url.md",
      });

      expect(result?.code).toContain(`<img src="https://example.com/cat.png" alt="remote">`);
      expect(result?.code).not.toContain(`import`);
      expect(() => compile(result?.code ?? "", { filename: "remote-url.svelte" })).not.toThrow();
    });

    it("passes data URIs through unchanged", async () => {
      const source = `![inline](data:image/png;base64,abc123)`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "data-uri.md",
      });

      expect(result?.code).toContain(`<img src="data:image/png;base64,abc123" alt="inline">`);
      expect(result?.code).not.toContain(`import`);
      expect(() => compile(result?.code ?? "", { filename: "data-uri.svelte" })).not.toThrow();
    });

    it("deduplicates repeated images to a single import", async () => {
      const source = `![a](./cat.png)\n\n![b](./cat.png)`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "dupe-image.md",
      });

      // Only one import
      const importMatches = (result?.code ?? "").match(/import catPng from/g);
      expect(importMatches?.length).toBe(1);
      // Both <img> tags use the same variable
      const srcMatches = (result?.code ?? "").match(/src=\{catPng\}/g);
      expect(srcMatches?.length).toBe(2);
      expect(() => compile(result?.code ?? "", { filename: "dupe-image.svelte" })).not.toThrow();
    });

    it("preserves title attribute on images", async () => {
      const source = `![cat](./cat.png "A cute cat")`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "title-image.md",
      });

      expect(result?.code).toContain(`import catPng from './cat.png';`);
      expect(result?.code).toContain(`<img src={catPng} alt="cat" title="A cute cat">`);
      expect(() => compile(result?.code ?? "", { filename: "title-image.svelte" })).not.toThrow();
    });

    it("handles multiple distinct images", async () => {
      const source = `![cat](./cat.png)\n\n![dog](./dog.jpg)`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "multi-image.md",
      });

      expect(result?.code).toContain(`import catPng from './cat.png';`);
      expect(result?.code).toContain(`import dogJpg from './dog.jpg';`);
      expect(result?.code).toContain(`<img src={catPng} alt="cat">`);
      expect(result?.code).toContain(`<img src={dogJpg} alt="dog">`);
      expect(() => compile(result?.code ?? "", { filename: "multi-image.svelte" })).not.toThrow();
    });

    it("creates instance script when none exists", async () => {
      const source = `---
title: Image Post
---

![cat](./cat.png)
`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "no-script.md",
      });

      expect(result?.code).toContain(`<script lang="ts">`);
      expect(result?.code).toContain(`import catPng from './cat.png';`);
      expect(result?.code).toContain(`export const metadata = {"title":"Image Post"};`);
      expect(result?.code).toContain(`<img src={catPng} alt="cat">`);
      expect(() => compile(result?.code ?? "", { filename: "no-script.svelte" })).not.toThrow();
    });

    it("is off by default", async () => {
      const source = `![cat](./cat.png)`;

      const result = await svelteMarkdown().markup?.({
        content: source,
        filename: "default-off.md",
      });

      expect(result?.code).toContain(`<img src="./cat.png" alt="cat">`);
      expect(result?.code).not.toContain(`import`);
      expect(() => compile(result?.code ?? "", { filename: "default-off.svelte" })).not.toThrow();
    });

    it("images inside lists work correctly", async () => {
      const source = `- item one\n- ![icon](./icon.svg)\n- item three`;

      const result = await svelteMarkdown({ importImages: true }).markup?.({
        content: source,
        filename: "list-image.md",
      });

      expect(result?.code).toContain(`import iconSvg from './icon.svg';`);
      expect(result?.code).toContain(`<img src={iconSvg} alt="icon">`);
      expect(() => compile(result?.code ?? "", { filename: "list-image.svelte" })).not.toThrow();
    });
  });

});
