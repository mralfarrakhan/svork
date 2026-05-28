import type { PreprocessorGroup } from "svelte/compiler";
import { unified, type PluggableList } from "unified";
import rehypeStringify from "rehype-stringify";
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

      // .hast() returns the <html> element; extract body children into a root node
      const docHast = htmlOutput.hast() as any;
      const bodyEl = docHast.children?.find((n: any) => n.tagName === "body");
      const bodyRoot = {
        type: "root" as const,
        children: (bodyEl?.children ?? docHast.children ?? []) as any[],
      };

      // 4. Run through rehype plugins and escape braces for Svelte safety
      const transformed = await rehypeProcessor.run(bodyRoot as any);
      const html = revertDoubleEscapedBraces(
        rehypeProcessor.stringify(transformed as any),
      );

      // 5. Wrap in a Svelte component with exported metadata
      const metadataString = `\nexport const metadata = ${JSON.stringify(metadata)};\n`;
      const code = `<script module lang="ts">${metadataString}</script>\n${html}`;

      return { code };
    },
  };
};
