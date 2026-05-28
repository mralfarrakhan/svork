const escapeSvelteTextBraces = (value: string) =>
  value.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

// Revert numeric entity double-escaping produced by rehype-stringify
// (e.g. &amp;#123; or &#x26;#123;) back to &#123;/&#125;.
export const revertDoubleEscapedBraces = (html: string) =>
  html
    .replace(/(&amp;#123;|&#x26;#123;)/g, "&#123;")
    .replace(/(&amp;#125;|&#x26;#125;)/g, "&#125;");

// Rehype plugin: escape leftover braces after user plugins have generated their HTML.
export function escapeBracesPlugin() {
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
