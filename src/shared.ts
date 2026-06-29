// Check if an image URL refers to a local file (not remote, not data URI, not hash-only).
// "./cat.png" / "../img/logo.svg" / "assets/photo.jpg" → true
// "https://example.com/img.png" / "data:image/png;base64,..." / "#ref" → false
export const isLocalImageUrl = (url: string): boolean => {
  if (!url) return false;
  return !/^(https?:)?\/\//i.test(url) && !/^data:/i.test(url) && !/^#/.test(url);
};

// Convert file path to valid JavaScript identifier.
// "./my-cat-photo.png" → "myCatPhotoPng"
// "../assets/logo.svg" → "logoSvg"
// "cat.jpeg" → "catJpeg"
// "some_dir/file-name.png" → "fileNamePng"
export const imagePathToIdentifier = (path: string): string => {
  // Strip directory and extension
  const basename = path.replace(/^.*[/\\]/, "");
  const dotIndex = basename.lastIndexOf(".");
  const name = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const ext = dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : "";

  // kebab-case / snake_case / mixed.dots → camelCase
  const camel = name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[^a-zA-Z_$]/, "");

  // PascalCase → camelCase (first char lower)
  const identifier = camel.charAt(0).toLowerCase() + camel.slice(1) || "img";

  // Append extension as PascalCase suffix for disambiguation
  const extSuffix = ext
    ? ext.charAt(0).toUpperCase() + ext.slice(1).replace(/[^a-zA-Z0-9]/g, "")
    : "";

  const result = identifier + extSuffix;

  // Ensure valid JS identifier: must start with letter/_/$
  if (!/^[a-zA-Z_$]/.test(result)) return "img" + (extSuffix || "Asset");

  return result;
};

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
