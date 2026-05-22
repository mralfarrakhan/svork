import { parse, type PreprocessorGroup } from "svelte/compiler";
import { unified, type PluggableList } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import yaml from "js-yaml";
import dedent from "dedent";

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
  const PLACEHOLDER_PREFIX = "SVELTEEXPR";
  const PLACEHOLDER_SUFFIX = "ENDEXPR";

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
      let offsetDelta = 0;

      let root;
      try {
        root = parse(content, { modern: true }) as any;
      } catch (err) {
        console.warn(
          `[svelteMarkdown] Svelte AST parsing failed for ${filename}, executing full-text fallback compilation.`,
        );
        const fallbackResult = await mdCompiler.process(content);
        return { code: String(fallbackResult) };
      }

      const firstNode = root.fragment?.nodes?.[0];
      if (firstNode?.type === "Text" && FRONTMATTER_REGEX.test(firstNode.raw)) {
        const match = firstNode.raw.match(FRONTMATTER_REGEX);
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
          workingString.slice(0, firstNode.start) +
          workingString.slice(firstNode.end);
        try {
          root = parse(workingString, { modern: true }) as any;
        } catch (err) {
          console.error(
            `[svelteMarkdown] Re-parse after frontmatter strip failed for ${filename}, aborting.`,
          );
          return { code: content };
        }
      }

      const processGroup = async (nodes: any[]) => {
        const placeholderMap = new Map<string, string>();

        const combined = nodes
          .map((node, i) => {
            if (node.type === "Text") return node.raw;

            const placeholder = `${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`;
            const original = workingString.slice(
              node.start + offsetDelta,
              node.end + offsetDelta,
            );
            placeholderMap.set(placeholder, original);
            return placeholder;
          })
          .join("");

        const processed = String(await mdCompiler.process(dedent(combined)));

        const restored = processed.replace(
          new RegExp(`${PLACEHOLDER_PREFIX}\\d+${PLACEHOLDER_SUFFIX}`, "g"),
          (match) => placeholderMap.get(match) ?? match,
        );

        return restored.replace(
          /(\{(?:[^{}])*\})|(\{)|(\})/g,
          (_, expr, open, close) => {
            if (expr) return expr; // keep {expression} intact
            if (open) return "&#123;"; // lone { → escape
            return "&#125;"; // lone } → escape
          },
        );
      };

      const collectText = async (node: any) => {
        if (!node) return;

        if (node.type === "EachBlock") {
          await collectFragment(node.body);
          if (node.fallback) await collectFragment(node.fallback);
        } else if (node.type === "IfBlock") {
          await collectFragment(node.consequent);
          if (node.alternate) {
            if (node.alternate.type === "IfBlock") {
              await collectText(node.alternate);
            } else {
              await collectFragment(node.alternate);
            }
          }
        } else if (node.type === "AwaitBlock") {
          if (node.pending) await collectFragment(node.pending);
          if (node.then) await collectFragment(node.then);
          if (node.catch) await collectFragment(node.catch);
        } else if (node.type === "KeyBlock" || node.type === "SnippetBlock") {
          await collectFragment(node.body);
        } else if (node.fragment) {
          await collectFragment(node.fragment);
        }
      };

      const collectFragment = async (fragment: any) => {
        if (!fragment || !Array.isArray(fragment.nodes)) return;

        const nodes = fragment.nodes;
        let i = 0;

        while (i < nodes.length) {
          const node = nodes[i];

          if (node.type === "Text" || node.type === "ExpressionTag") {
            const group: any[] = [];
            while (
              i < nodes.length &&
              (nodes[i].type === "Text" || nodes[i].type === "ExpressionTag")
            ) {
              group.push(nodes[i]);
              i++;
            }

            const hasText = group.some(
              (n) => n.type === "Text" && n.raw.trim().length > 0,
            );

            if (hasText) {
              const groupStart = group[0].start;
              const groupEnd = group[group.length - 1].end;
              const processed = await processGroup(group);

              workingString =
                workingString.slice(0, groupStart + offsetDelta) +
                processed +
                workingString.slice(groupEnd + offsetDelta);

              offsetDelta += processed.length - (groupEnd - groupStart);
            }
          } else {
            await collectText(node);
            i++;
          }
        }
      };

      if (root.fragment) {
        await collectFragment(root.fragment);
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

      return { code: workingString };
    },
  };
};
