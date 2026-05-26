import { parse, type PreprocessorGroup } from "svelte/compiler";
import { unified, type PluggableList } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import yaml from "js-yaml";

type PlaceholderType =
  | "Expression"
  | "ComponentBoundary"
  | "EscapedText"
  | "InstanceScript"
  | "ModuleScript";

type Target = {
  type: PlaceholderType;
  start: number;
  end: number;
};

type PlaceholderInfo = {
  original: string;
  replacement: string;
  type: PlaceholderType;
};

export type SvelteMarkdownOptions = {
  extensions?: string[];
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
};

// Lightweight id generator to avoid deterministic collisions
const genId = () =>
  `SVELTE_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

const escapeSvelteText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeHtmlText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const getExpressionSurrogate = (source: string) => {
  const expression = source.slice(1, -1).trim();
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(expression)) {
    return expression.replace(/\./g, " ");
  }

  const stringMatch = expression.match(/^(['"`])(.+)\1$/);
  if (stringMatch) return stringMatch[2];

  return "";
};

const getComponentSurrogate = (source: string) => {
  if (source.startsWith("</")) return "";

  const match = source.match(/^<([A-Z][\w.$]*)\b/);
  if (!match) return "";

  return match[1].split(".").filter(Boolean).join(" ");
};

const getPlaceholderReplacement = (
  token: string,
  type: PlaceholderType,
  original: string,
) => {
  if (type !== "Expression" && type !== "ComponentBoundary") return token;

  const surrogate =
    type === "Expression"
      ? getExpressionSurrogate(original)
      : getComponentSurrogate(original);

  return `<svork-placeholder data-svork-id="${escapeHtmlAttribute(token)}">${escapeHtmlText(surrogate)}</svork-placeholder>`;
};

const isSvelteAttribute = (attr: any) => {
  if (!attr || attr.type !== "Attribute") return true;
  if (Array.isArray(attr.value)) {
    return attr.value.some((valueNode: any) => valueNode?.type !== "Text");
  }

  return attr.value?.type === "ExpressionTag";
};

const maskRange = (chars: string[], start: number, end: number) => {
  for (let i = start; i < end; i++) {
    if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  }
};

const overlapsRange = (
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number,
) => ranges.some((range) => start < range.end && end > range.start);

const getScriptRanges = (source: string) => {
  const ranges: Array<{ start: number; end: number }> = [];
  const scriptRegex = /<script\b[\s\S]*?<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(source))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  return ranges;
};

const maskMarkdownCodeForSvelteParse = (source: string) => {
  const chars = source.split("");
  const maskedRanges: Array<{ start: number; end: number }> = [];
  const lines = source.matchAll(/[^\n]*(?:\n|$)/g);
  let fence: { marker: "`" | "~"; length: number; start: number } | null = null;

  for (const lineMatch of lines) {
    const line = lineMatch[0];
    const lineStart = lineMatch.index ?? 0;
    if (line === "" && lineStart === source.length) continue;

    if (fence) {
      const closeMatch = line.match(/^( {0,3})(`{3,}|~{3,})\s*(?:\n|$)/);
      const closeMarker = closeMatch?.[2];
      if (
        closeMarker &&
        closeMarker[0] === fence.marker &&
        closeMarker.length >= fence.length
      ) {
        const end = lineStart + line.length;
        maskedRanges.push({ start: fence.start, end });
        maskRange(chars, fence.start, end);
        fence = null;
      }
      continue;
    }

    const openMatch = line.match(/^( {0,3})(`{3,}|~{3,})/);
    const openMarker = openMatch?.[2];
    if (openMarker) {
      fence = {
        marker: openMarker[0] as "`" | "~",
        length: openMarker.length,
        start: lineStart,
      };
    }
  }

  if (fence) {
    maskedRanges.push({ start: fence.start, end: source.length });
    maskRange(chars, fence.start, source.length);
  }

  const ignoredInlineRanges = maskedRanges.concat(getScriptRanges(source));
  const inlineCodeRegex = /(`+)([^\n]*?)\1/g;
  let inlineMatch: RegExpExecArray | null;

  while ((inlineMatch = inlineCodeRegex.exec(source))) {
    const start = inlineMatch.index;
    const end = start + inlineMatch[0].length;
    if (overlapsRange(ignoredInlineRanges, start, end)) continue;
    maskRange(chars, start, end);
  }

  return chars.join("");
};

const escapeSvelteTextBraces = (value: string) =>
  value.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

// Escape braces in raw HTML strings produced by user rehype plugins.
// Skips <script> and <style> blocks so their brace syntax (JS/CSS) is preserved.
const escapeRawNodeBraces = (html: string): string => {
  // Escape < and > inside quoted attribute values first so that e.g. a <style>
  // tag embedded in a data-code attribute value is not mistaken for a real
  // style block by the regex below (which would then skip brace-escaping inside it).
  const withSafeAttrs = html.replace(/"([^"]*)"/g, (match, val) =>
    val.includes("<")
      ? `"${val.replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`
      : match,
  );

  const scriptStyleRegex =
    /(<(?:script|style)\b[\s\S]*?<\/(?:script|style)\s*>)/gi;
  return withSafeAttrs
    .split(scriptStyleRegex)
    .map((part, i) => (i % 2 === 1 ? part : escapeSvelteTextBraces(part)))
    .join("");
};

// Rehype plugin: escape leftover braces after user plugins have generated their HTML.
function escapeBracesPlugin() {
  return (tree: any) => {
    const SKIP = new Set(["script", "style"]);

    const escapeProperties = (properties: Record<string, any> | undefined) => {
      if (!properties) return;

      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === "string") {
          properties[key] = escapeSvelteTextBraces(value);
        } else if (Array.isArray(value)) {
          properties[key] = value.map((item) =>
            typeof item === "string" ? escapeSvelteTextBraces(item) : item,
          );
        }
      }
    };

    const visit = (node: any, ancestors: any[]) => {
      if (!node) return;
      if (node.type === "element") {
        escapeProperties(node.properties);
      }

      if (node.type === "raw" && typeof node.value === "string") {
        node.value = escapeRawNodeBraces(node.value);
        return;
      }

      if (node.type === "text") {
        const hasSkipAncestor = ancestors.some(
          (a: any) =>
            a?.type === "element" &&
            typeof a.tagName === "string" &&
            SKIP.has(a.tagName),
        );
        if (
          !hasSkipAncestor &&
          typeof node.value === "string" &&
          (node.value.includes("{") || node.value.includes("}"))
        ) {
          node.value = escapeSvelteTextBraces(node.value);
        }
      }

      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const c of child) visit(c, ancestors.concat(node));
        } else if (child && typeof child === "object" && child.type) {
          visit(child, ancestors.concat(node));
        }
      }
    };

    visit(tree, []);
  };
}

export const svelteMarkdown = (
  options?: SvelteMarkdownOptions,
): PreprocessorGroup => {
  const hasWantedExt = (s: string) =>
    (options?.extensions ?? [".md"]).some((e) => s.endsWith(e.trim()));

  const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

  const mdCompiler = unified()
    .use(remarkParse)
    .use(options?.remarkPlugins ?? [])
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(options?.rehypePlugins ?? [])
    .use(escapeBracesPlugin)
    .use(rehypeStringify, { allowDangerousHtml: true });

  return {
    name: "svelteMarkdown",
    markup: async ({ content, filename }) => {
      if (!filename || !hasWantedExt(filename)) return;

      let metadata: Record<string, any> = {};
      let workingString = content;

      // 1. Direct Frontmatter Extraction
      const fmMatch = workingString.match(FRONTMATTER_REGEX);
      if (fmMatch) {
        try {
          metadata = (yaml.load(fmMatch[1]) as Record<string, any>) ?? {};
        } catch (e) {
          console.error(
            `[svelteMarkdown] Frontmatter YAML parsing error in ${filename}:`,
            e,
          );
        }
        workingString = workingString.slice(fmMatch[0].length);
      }

      const finalize = async (
        markdownSource: string,
        placeholderMap = new Map<string, PlaceholderInfo>(),
      ) => {
        const vfile = await mdCompiler.process(markdownSource);
        let compiled = String(vfile);
        // Revert numeric entity double-escaping produced by stringifier (e.g. &amp;#123; or &#x26;#123;) back to &#123;/&#125;.
        compiled = compiled
          .replace(/(&amp;#123;|&#x26;#123;)/g, "&#123;")
          .replace(/(&amp;#125;|&#x26;#125;)/g, "&#125;");
        // Escape < > { } inside attribute values so Svelte's template parser does not
        // misinterpret embedded HTML tags (e.g. <style> in data-code) or brace expressions.
        // Browsers decode HTML entities when reading attributes, so clipboard/DOM access is unaffected.
        compiled = compiled.replace(/"([^"]*)"/g, (match, val) => {
          if (!val.includes("<") && !val.includes("{") && !val.includes("}"))
            return match;
          return `"${val.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;")}"`;
        });
        let restored = compiled;

        // Merge any fields injected into vfile.data.fm by remark/rehype plugins (e.g. reading time).
        if (vfile.data?.fm && typeof vfile.data.fm === "object") {
          metadata = { ...metadata, ...(vfile.data.fm as Record<string, any>) };
        }

        const metadataString = `\nexport const metadata = ${JSON.stringify(metadata)};\n`;
        let hasModuleScript = false;

        for (const [placeholder, info] of placeholderMap.entries()) {
          if (info.type === "ModuleScript") {
            const scriptTagMatch = info.original.match(/^<script[^>]*>/);
            if (scriptTagMatch) {
              const injectIndex = scriptTagMatch[0].length;
              info.original =
                info.original.slice(0, injectIndex) +
                metadataString +
                info.original.slice(injectIndex);
            }
            hasModuleScript = true;
          }

          const escPlaceholder = escapeRegExp(placeholder);
          const markerPattern = `<svork-placeholder\\s+data-svork-id=(["'])${escPlaceholder}\\1[^>]*>[\\s\\S]*?<\\/svork-placeholder>`;
          const markerRegex = new RegExp(markerPattern, "g");

          if (
            info.type === "ComponentBoundary" ||
            info.type === "InstanceScript" ||
            info.type === "ModuleScript" ||
            info.type === "EscapedText"
          ) {
            const pMarkerRegex = new RegExp(
              `<p>\\s*${markerPattern}\\s*</p>`,
              "g",
            );
            if (pMarkerRegex.test(restored)) {
              restored = restored.replace(pMarkerRegex, () => info.original);
              continue;
            }
          }

          if (markerRegex.test(restored)) {
            restored = restored.replace(markerRegex, () => info.original);
            continue;
          }

          // Strip paragraph wrappers added by the markdown compiler for scripts and component boundaries.
          if (
            info.type === "InstanceScript" ||
            info.type === "ModuleScript" ||
            info.type === "ComponentBoundary" ||
            info.type === "EscapedText"
          ) {
            const escapedReplacement = escapeRegExp(info.replacement);
            const pRegex = new RegExp(
              `<p>\\s*${escapedReplacement}\\s*</p>`,
              "g",
            );
            if (pRegex.test(restored)) {
              restored = restored.replace(pRegex, () => info.original);
              continue;
            }
          }

          // Restore exactly quoted attribute expressions like name="SVELTEEXP0SVELTE" -> name={budi}.
          if (info.type === "Expression") {
            const quotedRegex = new RegExp(`(["'])${escPlaceholder}\\1`, "g");
            if (quotedRegex.test(restored)) {
              restored = restored.replace(quotedRegex, () => info.original);
              continue;
            }

            const braceWrappedRegex = new RegExp(
              `\\{\\s*${escPlaceholder}\\s*\\}`,
              "g",
            );
            if (braceWrappedRegex.test(restored)) {
              restored = restored.replace(
                braceWrappedRegex,
                () => info.original,
              );
              continue;
            }
          }

          restored = restored.replace(
            new RegExp(placeholder, "g"),
            () => info.original,
          );
        }

        if (!hasModuleScript) {
          restored =
            `<script module lang="ts">${metadataString}</script>\n` + restored;
        }

        return restored;
      };

      // 2. Svelte Modern AST Parsing
      let root;
      try {
        root = parse(maskMarkdownCodeForSvelteParse(workingString), {
          modern: true,
        }) as any;
      } catch (err) {
        console.warn(
          `[svelteMarkdown] Svelte AST parsing failed for ${filename}, executing full-text fallback compilation.`,
        );
        return { code: await finalize(workingString) };
      }

      // 3. Target Node Collection
      const targets: Target[] = [];

      if (root.instance) {
        targets.push({
          type: "InstanceScript",
          start: root.instance.start,
          end: root.instance.end,
        });
      }
      if (root.module) {
        targets.push({
          type: "ModuleScript",
          start: root.module.start,
          end: root.module.end,
        });
      }

      // Helper to compute start and end boundaries of an AST Fragment (since Svelte 5 AST Fragment has no start/end)
      const getFragmentBounds = (frag: any) => {
        if (frag && Array.isArray(frag.nodes) && frag.nodes.length > 0) {
          return {
            start: frag.nodes[0].start,
            end: frag.nodes[frag.nodes.length - 1].end,
          };
        }
        return null;
      };

      const walk = (node: any) => {
        if (!node) return;

        if (node.type === "ExpressionTag") {
          targets.push({
            type: "Expression",
            start: node.start,
            end: node.end,
          });
          return;
        }

        if (node.type === "RegularElement") {
          const hasUnsupportedSvelteAttribute = node.attributes?.some(
            (attr: any) => isSvelteAttribute(attr),
          );

          if (hasUnsupportedSvelteAttribute) {
            targets.push({
              type: "EscapedText",
              start: node.start,
              end: node.end,
            });
            return;
          }
        }

        if (node.type === "Component") {
          const bounds = getFragmentBounds(node.fragment);
          if (bounds) {
            targets.push({
              type: "ComponentBoundary",
              start: node.start,
              end: bounds.start,
            });
            targets.push({
              type: "ComponentBoundary",
              start: bounds.end,
              end: node.end,
            });
            walk(node.fragment);
          } else {
            targets.push({
              type: "ComponentBoundary",
              start: node.start,
              end: node.end,
            });
          }
          return;
        }

        if (node.fragment) {
          walk(node.fragment);
        }
        if (Array.isArray(node.nodes)) {
          for (const child of node.nodes) {
            walk(child);
          }
        }
      };

      walk(root.fragment);

      // Remove invalid/empty boundaries
      const validTargets = targets.filter((t) => t.start < t.end);

      // 4. Back-to-Front Substitution
      validTargets.sort((a, b) => b.start - a.start);

      const placeholderMap = new Map<string, PlaceholderInfo>();
      let substitutedString = workingString;

      for (let i = 0; i < validTargets.length; i++) {
        const target = validTargets[i];
        const originalSource = substitutedString.slice(
          target.start,
          target.end,
        );
        const original =
          target.type === "EscapedText"
            ? escapeSvelteText(originalSource)
            : originalSource;

        // Use pure alphanumeric identifiers to prevent Markdown compilers from parsing double underscores '__' as bold
        const id = genId();
        const placeholder = `SVELTE_${target.type.toUpperCase()}_${id}_${i}_SVELTE`;
        const replacement = getPlaceholderReplacement(
          placeholder,
          target.type,
          original,
        );

        placeholderMap.set(placeholder, {
          original,
          replacement,
          type: target.type,
        });

        substitutedString =
          substitutedString.slice(0, target.start) +
          replacement +
          substitutedString.slice(target.end);
      }

      // 5. Continuous Markdown Compilation Pass, metadata injection, and placeholder restoration.
      return { code: await finalize(substitutedString, placeholderMap) };
    },
  };
};
