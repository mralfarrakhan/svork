import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import rehypeExpressiveCode from "rehype-expressive-code";
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

  it("does not inject metadata into module scripts", async () => {
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

    expect(result?.code?.startsWith(
      `<script lang="ts">\nexport const metadata = {"title":"Module Post"};\n</script>`,
    )).toBe(true);
    expect(result?.code).toContain(
      `<script module>\nexport const prerender = true;\n</script>`,
    );
    expect(result?.code).not.toContain(
      `<script module>\nexport const metadata = {"title":"Module Post"};`,
    );
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

    expect(result?.code?.startsWith(
      `<script lang="ts">\nexport const metadata = {"title":"Context Module Post"};\n</script>`,
    )).toBe(true);
    expect(result?.code).toContain(
      `<script context='module'>\nexport const csr = false;\n</script>`,
    );
    expect(result?.code).not.toContain(
      `<script context='module'>\nexport const metadata = {"title":"Context Module Post"};`,
    );
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

});
