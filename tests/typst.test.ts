import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { svelteTypst } from "../src";

describe("svelteTypst", () => {
  it("converts a basic document to a Svelte component", async () => {
    const source = `= Hello World

This is a paragraph.
`;

    const result = await svelteTypst().markup?.({
      content: source,
      filename: "doc.typ",
    });

    expect(result?.code).toContain(`export const metadata = {};`);
    expect(result?.code).toContain(`<h2>Hello World</h2>`);
    expect(result?.code).toContain(`<p>This is a paragraph.</p>`);
    expect(() => compile(result?.code ?? "", { filename: "doc.svelte" })).not.toThrow();
  });

  it("extracts metadata from #metadata label", async () => {
    const source = `#metadata((
  title: "My Post",
  author: "Budi",
)) <frontmatter>

= Hello

A paragraph.
`;

    const result = await svelteTypst().markup?.({
      content: source,
      filename: "meta.typ",
    });

    expect(result?.code).toContain(
      `export const metadata = {"author":"Budi","title":"My Post"};`,
    );
    expect(result?.code).toContain(`<h2>Hello</h2>`);
    expect(() => compile(result?.code ?? "", { filename: "meta.svelte" })).not.toThrow();
  });

  it("exports empty metadata when no frontmatter label is present", async () => {
    const source = `= Just a heading`;

    const result = await svelteTypst().markup?.({
      content: source,
      filename: "no-meta.typ",
    });

    expect(result?.code).toContain(`export const metadata = {};`);
    expect(() => compile(result?.code ?? "", { filename: "no-meta.svelte" })).not.toThrow();
  });

  it("escapes braces in document text for Svelte safety", async () => {
    const source = `Text with {raw braces} here.`;

    const result = await svelteTypst().markup?.({
      content: source,
      filename: "braces.typ",
    });

    expect(result?.code).toContain("&#123;raw braces&#125;");
    expect(result?.code).not.toContain("{raw braces}");
    expect(() => compile(result?.code ?? "", { filename: "braces.svelte" })).not.toThrow();
  });

  it("skips files with non-matching extension", async () => {
    const result = await svelteTypst().markup?.({
      content: "= Hello",
      filename: "doc.md",
    });

    expect(result).toBeUndefined();
  });

  it("respects custom extensions", async () => {
    const result = await svelteTypst({ extensions: [".typst"] }).markup?.({
      content: "= Hello",
      filename: "doc.typst",
    });

    expect(result?.code).toBeDefined();
    expect(result?.code).toContain(`export const metadata = {};`);
  });

  it("applies rehype plugins to the HTML output", async () => {
    const source = `= Section One

A paragraph.

== Subsection

Another paragraph.
`;

    const result = await svelteTypst({
      rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]],
    }).markup?.({
      content: source,
      filename: "slugs.typ",
    });

    expect(result?.code).toContain(`id="section-one"`);
    expect(result?.code).toContain(`href="#section-one"`);
    expect(() => compile(result?.code ?? "", { filename: "slugs.svelte" })).not.toThrow();
  });

  it("seeds vfile.data.fm with Typst metadata so plugins can read and augment it", async () => {
    const rehypeInjectFm = () => (_tree: any, file: any) => {
      // Plugin reads existing title and adds a derived field
      const existing = file.data.fm ?? {};
      file.data.fm = { ...existing, slug: (existing.title ?? "").toLowerCase().replace(/\s+/g, "-") };
    };

    const source = `#metadata((title: "My Post")) <frontmatter>

= Hello
`;

    const result = await svelteTypst({
      rehypePlugins: [rehypeInjectFm],
    }).markup?.({
      content: source,
      filename: "fm-merge.typ",
    });

    expect(result?.code).toContain(`"title":"My Post"`);
    expect(result?.code).toContain(`"slug":"my-post"`);
    expect(() => compile(result?.code ?? "", { filename: "fm-merge.svelte" })).not.toThrow();
  });

  it("escapes braces injected by rehype plugins", async () => {
    const rehypeInjectBraces = () => (tree: any) => {
      tree.children.push({
        type: "element",
        tagName: "div",
        properties: { title: "{injected}" },
        children: [{ type: "text", value: "{also injected}" }],
      });
    };

    const result = await svelteTypst({
      rehypePlugins: [rehypeInjectBraces],
    }).markup?.({
      content: "= Hello",
      filename: "inject.typ",
    });

    expect(result?.code).toContain(`title="&#123;injected&#125;"`);
    expect(result?.code).toContain(`&#123;also injected&#125;`);
    expect(() => compile(result?.code ?? "", { filename: "inject.svelte" })).not.toThrow();
  });
});
