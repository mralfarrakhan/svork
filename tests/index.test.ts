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

    expect(result?.code).toBe(`<script lang="ts">
export const metadata = {"title":"Boo Dee","author":"Budi"};
import Budi from 'Budi.svelte';
const budi = "budi";
import Badrul from 'Svelte.svelte';
</script>

<Hudi name={budi} />

<Badrul><p>This is content</p></Badrul>

<h1>Hello, { budi }!</h1>

<p>This is a test file</p>

<h1>Inventory List</h1>

{#each items as item}
<ul>
<li>{item.name} - {item.price}</li>
</ul>
{/each}
`);
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

    expect(result?.code).toBe(`<script lang="ts">
export const metadata = {};

import Budi from '../Budi.svelte';

const budi = "budi";
</script>

<Budi name={budi}><p>This is {budi}</p></Budi>
`);
  });
});
