import type { PreprocessorGroup } from "svelte/compiler";
import { unified, type PluggableList } from "unified";
import rehypeStringify from "rehype-stringify";
import { VFile } from "vfile";
import { parseFragment } from "parse5";
import { fromParse5 } from "hast-util-from-parse5";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { CompileArgs } from "@myriaddreamin/typst-ts-node-compiler";
import { escapeBracesPlugin, revertDoubleEscapedBraces } from "./shared.js";

export type SvelteTypstOptions = {
  extensions?: string[];
  rehypePlugins?: PluggableList;
  compileArgs?: CompileArgs;
};

export const svelteTypst = (options?: SvelteTypstOptions): PreprocessorGroup => {
  let compiler: NodeCompiler | null = null;

  const getCompiler = () => {
    if (!compiler) {
      compiler = NodeCompiler.create(options?.compileArgs ?? {});
    }
    return compiler;
  };

  const hasWantedExt = (s: string) =>
    (options?.extensions ?? [".typ"]).some((e) => s.endsWith(e.trim()));

  const rehypeProcessor = unified()
    .use(options?.rehypePlugins ?? [])
    .use(escapeBracesPlugin)
    .use(rehypeStringify, { allowDangerousHtml: true });

  return {
    name: "svelteTypst",
    markup: async ({ content, filename }) => {
      if (!filename || !hasWantedExt(filename)) return;

      const c = getCompiler();

      // 1. Compile Typst source to HTML target — one pass for both query and rendering
      const compiled = c.compileHtml({ mainFileContent: content });
      if (compiled.hasError()) {
        compiled.printErrors();
        throw new Error(`[svelteTypst] Compilation failed for ${filename}`);
      }
      const doc = compiled.result!;

      // 2. Query frontmatter metadata via #metadata((...)) <frontmatter> label
      let metadata: Record<string, any> = {};
      try {
        const queryResult = c.query(doc, {
          selector: "<frontmatter>",
          field: "value",
        }) as unknown[];
        if (Array.isArray(queryResult) && queryResult.length > 0) {
          const value = queryResult[0];
          if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            metadata = value as Record<string, any>;
          }
        }
      } catch {
        // No <frontmatter> label — that is fine
      }

      // 3. Render as HTML and extract body children from the hast tree
      const htmlExec = c.tryHtml(doc);
      if (htmlExec.hasError()) {
        htmlExec.printErrors();
        throw new Error(`[svelteTypst] HTML rendering failed for ${filename}`);
      }
      const htmlOutput = htmlExec.result!;

      // Parse body HTML into a hast tree (avoids the noisy native .hast() call)
      const bodyRoot = fromParse5(parseFragment(htmlOutput.body()));

      // 4. Run through rehype plugins and escape braces for Svelte safety
      const vfile = new VFile();
      vfile.data.fm = { ...metadata };
      const transformed = await rehypeProcessor.run(bodyRoot as any, vfile);
      const html = revertDoubleEscapedBraces(
        rehypeProcessor.stringify(transformed as any, vfile),
      );

      // Merge any fields injected into vfile.data.fm by rehype plugins (e.g. reading time)
      if (vfile.data?.fm && typeof vfile.data.fm === "object") {
        metadata = { ...metadata, ...(vfile.data.fm as Record<string, any>) };
      }

      // 5. Wrap in a Svelte component with exported metadata
      const metadataString = `\nexport const metadata = ${JSON.stringify(metadata)};\n`;
      const code = `<script module lang="ts">${metadataString}</script>\n${html}`;

      return { code };
    },
  };
};
