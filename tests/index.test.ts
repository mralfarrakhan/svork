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

    expect(result?.code).toBe("heehee");
  });

  it("component", async () => {
    const source = `<script lang="ts">
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

    expect(result?.code).toBe("heehee");
  });
});
