import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
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

    // 4. Svelte block boundaries preserved
    expect(result?.code).toContain(`{#each items as item}`);
    expect(result?.code).toContain(`{/each}`);
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

  it("preserves svelte directives on regular elements", async () => {
    const source = `<script lang="ts">
let name = "Budi";
let ok = true;
const save = () => {};
</script>

<input bind:value={name} class:active={ok} on:click={save} />
`;

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "directives.md",
    });

    expect(result?.code).toContain(
      `<input bind:value={name} class:active={ok} on:click={save} />`,
    );
    expect(() => compile(result?.code ?? "", { filename: "directives.svelte" })).not.toThrow();
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

  it("preserves braces inside code fences", async () => {
    const source = "```\nconst a = { test: true }\n```";

    const result = await svelteMarkdown().markup?.({
      content: source,
      filename: "code.md",
    });

    expect(result?.code).toContain("const a = { test: true }");
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

});
