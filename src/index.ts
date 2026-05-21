import { parse, type PreprocessorGroup } from "svelte/compiler";
import { unified, type PluggableList } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import yaml from "js-yaml";
import dedent from "dedent";

// Pull minimum layout shapes from your provided AST spec for internal typing
interface BaseASTNode {
  type: string;
  start: number;
  end: number;
}

interface SvelteTextNode extends BaseASTNode {
  type: "Text";
  data: string;
  raw: string;
}

export type SvelteMarkdownOptions = {
  extensions?: string[];
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
};

export const svelteMarkdown = (
  options?: SvelteMarkdownOptions,
): PreprocessorGroup => {
  const hasWantedExt = (s: string) =>
    (options?.extensions ?? [".md"]).some((e) => s.endsWith(e));
  const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

  const mdCompiler = unified()
    .use(remarkParse)
    .use(options?.remarkPlugins ?? [])
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(options?.rehypePlugins ?? [])
    .use(rehypeStringify, { allowDangerousHtml: true });

  return {
    name: "svelteMarkdown",
    markup: async ({ content, filename }) => {
      if (!filename || !hasWantedExt(filename)) return;

      let metadata: Record<string, any> = {};
      let workingString = content;

      let root;
      try {
        // Returns your typed AST.Root structure
        root = parse(content, { modern: true }) as any;
      } catch (err) {
        console.warn(
          `[svelteMarkdown] Svelte AST parsing failed for ${filename}, executing full-text fallback compilation.`,
        );
        const fallbackResult = await mdCompiler.process(content);
        return { code: String(fallbackResult) };
      }

      const collectedTextNodes: SvelteTextNode[] = [];

      const collectText = (node: any) => {
        if (!node) return;

        if (node.type === "Text") {
          collectedTextNodes.push(node);
          return;
        }

        if (node.fragment) {
          collectFragment(node.fragment);
        }

        if (node.type === "EachBlock") {
          collectFragment(node.body);
          if (node.fallback) collectFragment(node.fallback);
        } else if (node.type === "IfBlock") {
          collectFragment(node.consequent);
          if (node.alternate) collectFragment(node.alternate);
        } else if (node.type === "AwaitBlock") {
          if (node.pending) collectFragment(node.pending);
          if (node.then) collectFragment(node.then);
          if (node.catch) collectFragment(node.catch);
        } else if (node.type === "KeyBlock" || node.type === "SnippetBlock") {
          collectFragment(node.body);
        }
      };

      const collectFragment = (fragment: any) => {
        if (fragment && Array.isArray(fragment.nodes)) {
          for (const child of fragment.nodes) {
            collectText(child);
          }
        }
      };

      if (root.fragment) {
        collectFragment(root.fragment);
      }

      collectedTextNodes.sort((a, b) => b.start - a.start);

      for (const textNode of collectedTextNodes) {
        const rawText = textNode.raw;

        if (textNode.start === 0 && FRONTMATTER_REGEX.test(rawText)) {
          const match = rawText.match(FRONTMATTER_REGEX);
          if (match) {
            try {
              metadata = yaml.load(match[1]) as Record<string, any>;
            } catch (e) {
              console.error(
                `[svelteMarkdown] Frontmatter YAML parsing error in ${filename}:`,
                e,
              );
            }
          }
          workingString =
            workingString.slice(0, textNode.start) +
            workingString.slice(textNode.end);
          continue;
        }

        if (rawText.trim().length > 0) {
          const dedented = dedent(rawText);
          const processedMd = await mdCompiler.process(dedented);

          const safeHtml = String(processedMd)
            .replace(/\{/g, "&#123;")
            .replace(/\}/g, "&#125;");

          workingString =
            workingString.slice(0, textNode.start) +
            safeHtml +
            workingString.slice(textNode.end);
        }
      }

      const metadataString = `\nexport const metadata = ${JSON.stringify(metadata)};\n`;

      if (root.instance) {
        workingString =
          workingString.slice(0, root.instance.content.start) +
          metadataString +
          workingString.slice(root.instance.content.start);
      } else {
        workingString =
          `<script lang="ts">${metadataString}</script>\n` + workingString;
      }

      return {
        code: workingString,
      };
    },
  };
};
