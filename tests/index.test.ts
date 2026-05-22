import { describe, expect, it } from "vitest";
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
});
