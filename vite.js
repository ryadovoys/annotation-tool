/*
 * Vite plugin. Adds the annotation tool to the dev server, never to a build.
 * For Vue it also stamps template lines, so a pick can say `AgentCard.vue:42`:
 * plain elements get `data-annotation-line`, components get the line on their
 * instance through a vnode hook, so nothing reaches their props or the DOM.
 * The stamps stay on the line they describe, so source lines do not move.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const SKIP_TAGS = new Set(["template", "slot", "component"]);
const SKIP_COMPONENTS = new Set(["Transition", "TransitionGroup", "KeepAlive", "Teleport", "Suspense"]);
const ELEMENT_NODE = 1;
const PLAIN_ELEMENT = 0;
const COMPONENT = 1;

export default function annotationTool({ color } = {}) {
  const source = readFileSync(new URL("./annotation-tool.js", import.meta.url), "utf8");
  let parseSfc;

  return {
    name: "annotation-tool",
    apply: "serve",
    enforce: "pre",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: color ? { "data-color": color } : {},
          children: source,
          injectTo: "body",
        },
      ];
    },
    transform(code, id) {
      if (!id.endsWith(".vue") || id.includes("/node_modules/")) return;
      // Resolved from the project, because that is where Vue is installed.
      parseSfc ??= createRequire(join(process.cwd(), "package.json"))("vue/compiler-sfc").parse;
      const template = parseSfc(code).descriptor.template?.ast;
      if (!template) return;

      const stamps = [];
      const walk = (node) => {
        const at = node.loc?.start;
        if (node.type === ELEMENT_NODE) {
          const offset = at.offset + 1 + node.tag.length;
          if (node.tagType === PLAIN_ELEMENT && !SKIP_TAGS.has(node.tag)) {
            stamps.push([offset, ` data-annotation-line="${at.line}"`]);
          } else if (
            node.tagType === COMPONENT &&
            !SKIP_COMPONENTS.has(node.tag) &&
            // A tag with its own vnode hook keeps it; two would not compile.
            !node.props.some((prop) => prop.rawName?.startsWith("@vue:"))
          ) {
            stamps.push([
              offset,
              ` @vue:before-mount="$event.component && ($event.component.annotationLine = ${at.line})"`,
            ]);
          }
        }
        node.children?.forEach(walk);
      };
      template.children.forEach(walk);

      let out = code;
      for (const [offset, text] of stamps.sort((a, b) => b[0] - a[0])) {
        out = out.slice(0, offset) + text + out.slice(offset);
      }
      return { code: out, map: null };
    },
  };
}
