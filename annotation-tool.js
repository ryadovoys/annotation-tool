/*
 * Annotation tool. Option+Shift+C, point at anything, W S to move up and down
 * the layers, click to copy a short numbered reference to it. Paste it into a
 * chat with an agent, as many times as you need in one message.
 *
 * One file, no dependencies. Reads Vue and React dev internals when they are
 * there and falls back to the plain DOM when they are not.
 */
(() => {
  if (window.__annotationTool) return;
  window.__annotationTool = true;

  const PALETTE = {
    lemon: "#fff200",
    pink: "#ff3da5",
    mint: "#2dffa8",
    sky: "#38bdf8",
  };
  const DEFAULT_COLOR = "lemon";
  const colorOption = document.currentScript?.dataset.color ?? DEFAULT_COLOR;
  const accent =
    PALETTE[colorOption] ??
    (/^#[0-9a-f]{3,8}$/i.test(colorOption) ? colorOption : PALETTE[DEFAULT_COLOR]);

  const MAX_LEVELS = 12;
  const MAX_LABEL = 60;
  const STATUS_MS = 2600;
  // Numbers start over after a pause, or with R while picking.
  const PICK_RESET_MS = 10 * 60 * 1000;

  const SKIP_COMPONENTS = new Set(["App", "AppShell", "RouterView", "RouterLink"]);
  const SEMANTIC_TAGS = new Set([
    "a", "article", "aside", "button", "dialog", "figure", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "img", "input", "label",
    "li", "main", "nav", "ol", "p", "section", "select", "svg", "table",
    "textarea", "ul", "video",
  ]);

  const STYLES = `
    :host {
      --color-black: #0a0a0a;
      --color-white: #ffffff;
      --color-gray-400: #a3a3a3;
      --color-gray-500: #737373;

      --accent: ${accent};
      --accent-ink: ${inkOn(accent)};
      --surface: var(--color-black);
      --surface-ink: var(--color-white);
      --surface-muted: var(--color-gray-400);
      --cap: rgba(255, 255, 255, .14);
      --edge: rgba(10, 10, 10, .55);

      --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      --text-sm: 12px;
      --text-xs: 11px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --radius-tick: 4px;
      --radius-bar: 10px;
      --ease: cubic-bezier(.23, 1, .32, 1);
      --shadow: 0 0 0 1px rgba(128, 128, 128, .28), 0 16px 32px -16px rgba(0, 0, 0, .5);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --surface: var(--color-white);
        --surface-ink: var(--color-black);
        --surface-muted: var(--color-gray-500);
        --cap: rgba(10, 10, 10, .08);
      }
    }
    * { box-sizing: border-box; }
    .catcher {
      position: fixed;
      inset: 0;
      z-index: 1;
      cursor: crosshair;
    }
    .mark {
      position: fixed;
      z-index: 2;
      pointer-events: none;
      border-radius: var(--radius-tick);
      background: color-mix(in srgb, var(--accent) 30%, transparent);
      outline: 2px solid var(--accent);
      box-shadow: 0 0 0 3px var(--edge);
      transition: left .12s var(--ease), top .12s var(--ease), width .12s var(--ease), height .12s var(--ease);
    }
    .label {
      position: absolute;
      left: -2px;
      bottom: 100%;
      margin-bottom: 5px;
      max-width: min(420px, 90vw);
      overflow: hidden;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-tick);
      background: var(--accent);
      color: var(--accent-ink);
      font: 500 var(--text-xs)/1.3 var(--mono);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mark.label-inside .label {
      top: 4px;
      bottom: auto;
      left: 4px;
      margin: 0;
    }
    .bar {
      position: fixed;
      left: 50%;
      bottom: var(--space-4);
      z-index: 3;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      max-width: calc(100vw - 2 * var(--space-4));
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-bar);
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--surface-muted);
      font: var(--text-sm)/1.4 var(--mono);
      pointer-events: none;
      transform: translateX(-50%);
      white-space: nowrap;
      animation: enter .2s var(--ease);
    }
    .bar.top {
      top: var(--space-4);
      bottom: auto;
    }
    .bar[hidden] { display: none; }
    .bar b {
      color: var(--surface-ink);
      font-weight: 500;
    }
    .hint {
      display: flex;
      gap: var(--space-3);
      overflow: hidden;
    }
    kbd {
      margin-right: var(--space-1);
      padding: 1px 5px;
      border-radius: var(--radius-tick);
      background: var(--cap);
      color: var(--surface-ink);
      font: inherit;
    }
    @keyframes enter {
      from { opacity: 0; transform: translate(-50%, 6px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mark { transition: none; }
      .bar { animation: none; }
    }
  `;

  /** Black text on light colours, white on dark, so any custom colour stays readable. */
  function inkOn(color) {
    let hex = color.slice(1, 7);
    if (hex.length < 6) hex = [...hex.slice(0, 3)].map((c) => c + c).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#0a0a0a" : "#ffffff";
  }

  // A shadow root keeps the page's CSS out of the tool and the tool's out of the page.
  const host = document.createElement("annotation-tool-ui");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="catcher" hidden></div>
    <div class="mark" hidden><span class="label"></span></div>
    <div class="bar" hidden></div>
  `;
  const catcher = shadow.querySelector(".catcher");
  const mark = shadow.querySelector(".mark");
  const label = shadow.querySelector(".label");
  const bar = shadow.querySelector(".bar");
  document.documentElement.appendChild(host);

  let active = false;
  let levels = [];
  let levelIndex = 0;
  // The level picked with W S. It stays selected while the pointer is still
  // inside it, so a small mouse jitter does not throw the chosen depth away.
  let pinned = null;
  let pickCount = 0;
  let lastPickAt = 0;
  let statusTimer = 0;
  let status = "";
  let pageSource = null;
  const sourceMaps = new Map();

  const selected = () => levels[levelIndex];

  function isEditable(target) {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
    );
  }

  function setActive(value) {
    active = value;
    catcher.hidden = !value;
    clearHover();
    // A focused text field would otherwise keep W and S for itself.
    if (value && isEditable(document.activeElement)) document.activeElement.blur();
    if (value) loadPageSource();
    renderBar();
  }

  function clearHover() {
    pinned = null;
    levels = [];
    levelIndex = 0;
    renderMark();
  }

  function onKey(event) {
    const code = event.code;
    if (event.altKey && event.shiftKey && code === "KeyC") {
      if (isEditable(event.target)) return;
      event.preventDefault();
      setActive(!active);
      return;
    }

    if (!active) return;
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActive(false);
    } else if (code === "KeyR" && plain) {
      event.preventDefault();
      event.stopPropagation();
      pickCount = 0;
      showStatus("Numbering restarts at [1]");
    } else if ((code === "KeyW" || code === "KeyS") && plain && levels.length) {
      // By key position, so W S work on any keyboard layout; Cmd+W stays the browser's.
      event.preventDefault();
      event.stopPropagation();
      levelIndex = Math.max(
        0,
        Math.min(levels.length - 1, levelIndex + (code === "KeyW" ? 1 : -1)),
      );
      pinned = selected().el;
      renderMark();
    }
  }

  // ---------- Vue ----------

  function displayName(name) {
    return name.includes("-")
      ? name.replace(/(^|-)(\w)/g, (_, __, character) => character.toUpperCase())
      : name;
  }

  /** Root elements of an instance, several when its template has more than one root. */
  function vueRoots(vnode, out = []) {
    if (!vnode) return out;
    if (vnode.component) return vueRoots(vnode.component.subTree, out);
    if (vnode.el instanceof Element) {
      out.push(vnode.el);
      return out;
    }
    if (Array.isArray(vnode.children)) {
      for (const child of vnode.children) {
        if (child && typeof child === "object") vueRoots(child, out);
      }
    }
    return out;
  }

  /** The nearest template in the project that wrote this component, with the line. */
  function vuePlacedAt(instance) {
    let written = instance;
    let owner = written.vnode?.ctx ?? null;
    while (owner) {
      const file = owner.type.__file;
      if (file && !isLibrary(file)) return { file, line: written.annotationLine };
      written = owner;
      owner = owner.vnode?.ctx ?? null;
    }
    return undefined;
  }

  /** The file the router mounted, because a shared component alone does not say which page. */
  function vuePage(instance) {
    while (instance?.parent) {
      const parent = instance.parent;
      if ((parent.type.__name || parent.type.name) === "RouterView") return instance.type.__file;
      instance = parent;
    }
    return undefined;
  }

  function vueFrames(instance, element) {
    const frames = [];
    while (instance && frames.length < MAX_LEVELS) {
      const name = instance.type.__name || instance.type.name;
      const root =
        name && !SKIP_COMPONENTS.has(name)
          ? vueRoots(instance.subTree).find((el) => el.contains(element))
          : undefined;
      if (root) {
        frames.push({
          name: displayName(name),
          file: instance.type.__file,
          placed: vuePlacedAt(instance),
          page: vuePage(instance),
          el: root,
          component: true,
        });
      }
      instance = instance.parent ?? undefined;
    }
    return frames;
  }

  // ---------- React ----------

  function fiberOf(node) {
    const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
    return key ? node[key] : undefined;
  }

  function fiberName({ type }) {
    if (!type || typeof type === "string") return undefined;
    const name =
      type.displayName ||
      type.name ||
      type.render?.displayName ||
      type.render?.name ||
      type.type?.displayName ||
      type.type?.name;
    // Production builds minify names down to a letter or two; those mean nothing.
    return name && name.length > 2 ? name : undefined;
  }

  function fiberRoots(fiber, out = []) {
    for (let child = fiber.child; child; child = child.sibling) {
      if (child.stateNode instanceof Element) out.push(child.stateNode);
      else fiberRoots(child, out);
    }
    return out;
  }

  /** Source lines of a served module, read from its inline source map. */
  function loadSourceMap(url) {
    if (sourceMaps.has(url)) return;
    sourceMaps.set(url, null);
    fetch(url)
      .then((response) => response.text())
      .then((code) => {
        const inline = code.match(/sourceMappingURL=data:application\/json;[^,]*base64,([\w+/=]+)/);
        if (inline) sourceMaps.set(url, decodeMappings(JSON.parse(atob(inline[1])).mappings));
      })
      .catch(() => {});
  }

  /** For each compiled line, its [column, source line] pairs. Other fields are read and dropped. */
  function decodeMappings(mappings) {
    const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let sourceLine = 0;
    return mappings.split(";").map((row) => {
      let column = 0;
      return row.split(",").filter(Boolean).map((segment) => {
        const fields = [];
        let value = 0;
        let shift = 0;
        for (const character of segment) {
          const digit = BASE64.indexOf(character);
          value |= (digit & 31) << shift;
          shift += 5;
          if (digit & 32) continue;
          fields.push(value & 1 ? -(value >> 1) : value >> 1);
          value = 0;
          shift = 0;
        }
        column += fields[0];
        if (fields.length > 2) sourceLine += fields[2];
        return [column, sourceLine + 1];
      });
    });
  }

  function originalLine(url, line, column) {
    loadSourceMap(url);
    const segments = sourceMaps.get(url)?.[line - 1] ?? [];
    return segments.findLast((segment) => segment[0] < column)?.[1] ?? segments[0]?.[1];
  }

  /**
   * Where the JSX of this fiber is written. React 18 keeps it on `_debugSource`.
   * React 19 only keeps a captured stack, whose first frame outside the
   * libraries is that JSX. Its lines are from the compiled file, so they go
   * through the source map; without one there is a file and no line.
   */
  function fiberSource(fiber) {
    if (fiber._debugSource) {
      return { file: fiber._debugSource.fileName, line: fiber._debugSource.lineNumber };
    }
    const stack = fiber._debugStack?.stack;
    if (!stack) return undefined;
    for (const row of stack.split("\n").slice(1)) {
      const match = row.match(/((?:https?|file):\/\/[^)\s]+?):(\d+):(\d+)\)?$/);
      if (match && !isLibrary(match[1])) {
        const [, file, line, column] = match;
        return { file, line: originalLine(file, Number(line), Number(column)) };
      }
    }
    return undefined;
  }

  function reactFrames(fiber, element) {
    const frames = [];
    for (let node = fiber; node && frames.length < MAX_LEVELS; node = node.return) {
      const name = fiberName(node);
      const root =
        name && !SKIP_COMPONENTS.has(name)
          ? fiberRoots(node).find((el) => el.contains(element))
          : undefined;
      if (root) {
        frames.push({ name, placed: fiberSource(node), el: root, component: true });
      }
    }
    return frames;
  }

  // ---------- Levels ----------

  function isLibrary(file) {
    return /node_modules|\/@react-refresh|\/@vite\//.test(file);
  }

  function componentFrames(element) {
    for (let node = element; node; node = node.parentElement) {
      if (node.__vueParentComponent) return vueFrames(node.__vueParentComponent, element);
      const fiber = fiberOf(node);
      if (fiber) return reactFrames(fiber, element);
    }
    return [];
  }

  function area(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function sameBox(a, b) {
    const first = a.getBoundingClientRect();
    const second = b.getBoundingClientRect();
    return (
      first.x === second.x &&
      first.y === second.y &&
      first.width === second.width &&
      first.height === second.height
    );
  }

  /**
   * Components under the point, smallest first. The chain starts at the topmost
   * element; components lying underneath it (a transparent overlay, a stretched
   * link) are added too, but only inside the smallest component already found,
   * so nothing from behind a dialog or another panel leaks in.
   */
  function framesAtPoint(stack) {
    const frames = componentFrames(stack[0]);
    const innermost = frames[0]?.el;
    if (!innermost) return frames;

    const hidden = [];
    const isKnown = (frame) =>
      [...frames, ...hidden].some((f) => f.el === frame.el && f.name === frame.name);
    for (const element of stack.slice(1)) {
      if (!innermost.contains(element) || innermost === element) continue;
      for (const frame of componentFrames(element)) {
        if (frame.el === innermost || !innermost.contains(frame.el)) break;
        if (!isKnown(frame)) hidden.push(frame);
      }
    }
    if (!hidden.length) return frames;

    return [...hidden, ...frames].sort((a, b) => {
      if (a.el !== b.el && a.el.contains(b.el)) return 1;
      if (a.el !== b.el && b.el.contains(a.el)) return -1;
      return area(a.el) - area(b.el);
    });
  }

  function elementName(node) {
    const tag = node.tagName.toLowerCase();
    if (node.id) return `${tag}#${node.id}`;
    // Class names with : or [ are utility noise.
    const classes = Array.from(node.classList)
      .filter((name) => !/[:[\]/]/.test(name))
      .slice(0, 2);
    return classes.length ? `${tag}.${classes.join(".")}` : tag;
  }

  function hasOwnText(element) {
    return Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
  }

  function isMeaningful(node) {
    return (
      Boolean(node.id || node.classList.length) ||
      node.hasAttribute("data-testid") ||
      SEMANTIC_TAGS.has(node.tagName.toLowerCase()) ||
      hasOwnText(node)
    );
  }

  /** Where a plain element is written, when a framework can tell. */
  function elementSource(node) {
    const owner = node.__vnode?.ctx;
    if (owner?.type.__file) {
      const line = node.getAttribute("data-annotation-line");
      return { file: owner.type.__file, line: line ? Number(line) : undefined };
    }
    const fiber = fiberOf(node);
    return fiber ? fiberSource(fiber) : undefined;
  }

  function elementLevel(node) {
    return { name: elementName(node), el: node, source: elementSource(node) };
  }

  /**
   * Elements between the pointer and the smallest component. On a page with
   * components only the nearest styled one, so W moves component to component.
   * On a plain page every meaningful ancestor is a layer.
   */
  function elementLevels(hit, innermost) {
    const found = [];
    for (let node = hit; node && node !== document.body; node = node.parentElement) {
      if (node === document.documentElement) break;
      if (innermost && (node === innermost.el || !innermost.el.contains(node))) break;
      if (!isMeaningful(node)) continue;
      if (innermost && !node.classList.length) continue;
      found.push(elementLevel(node));
      if (innermost || found.length >= MAX_LEVELS) break;
    }
    return found;
  }

  function levelsAt(stack) {
    const distinct = [];
    for (const frame of framesAtPoint(stack)) {
      const previous = distinct[distinct.length - 1];
      if (previous && sameBox(previous.el, frame.el)) {
        // Two components in one box: name the one from the project, not the library.
        if (frame.file && !isLibrary(frame.file) && (!previous.file || isLibrary(previous.file))) {
          distinct[distinct.length - 1] = frame;
        }
      } else {
        distinct.push(frame);
      }
    }
    const plain = elementLevels(stack[0], distinct[0]).filter(
      (level) => !distinct[0] || !sameBox(level.el, distinct[0].el),
    );
    return [...plain, ...distinct];
  }

  function updateHover(x, y) {
    const stack = document.elementsFromPoint(x, y).filter((node) => node !== host);
    if (!stack.length) {
      clearHover();
      return;
    }

    levels = levelsAt(stack);
    const pinnedIndex = pinned ? levels.findIndex((level) => level.el === pinned) : -1;
    if (pinnedIndex >= 0) {
      levelIndex = pinnedIndex;
    } else {
      pinned = null;
      levelIndex = Math.max(0, levels.findIndex((level) => level.component));
    }
    renderMark();
    // The bar moves out of the way when the pointer reaches it.
    bar.classList.toggle("top", y > window.innerHeight - 96);
  }

  // ---------- Page source, for line numbers on plain HTML ----------

  function loadPageSource() {
    if (location.protocol === "file:") return;
    fetch(location.href, { cache: "no-store" })
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        pageSource = text;
      })
      .catch(() => {
        pageSource = null;
      });
  }

  /** The source with comments and script and style bodies blanked, line breaks kept. */
  function maskedSource() {
    return pageSource.replace(
      /<!--[\s\S]*?-->|(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
      (match, open, _tag, body, close) => {
        const blank = (text) => text.replace(/[^\n]/g, " ");
        return open ? open + blank(body) + close : blank(match);
      },
    );
  }

  /**
   * The line of an element in a static HTML file: the Nth tag of its kind in the
   * DOM is the Nth tag in the source. If the tag counts differ, a script changed
   * the page and the answer would be a guess, so there is no line.
   */
  function htmlSource(element) {
    if (!pageSource) return undefined;
    const tag = element.tagName.toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) return undefined;
    const masked = maskedSource();
    const tags = [...masked.matchAll(new RegExp(`<${tag}(?=[\\s>/])`, "gi"))];
    const inDom = Array.from(document.getElementsByTagName(tag));
    if (tags.length !== inDom.length) return undefined;
    const before = masked.slice(0, tags[inDom.indexOf(element)].index);
    return { file: currentFile(), line: before.split("\n").length };
  }

  function currentFile() {
    return location.pathname.split("/").pop() || "index.html";
  }

  // ---------- The copied text ----------

  /** A path from the source folder down, so the copied text stays short. */
  function shortPath(file) {
    if (!file) return undefined;
    const clean = file.replace(/^(?:https?|file):\/\/[^/]*/, "").replace(/\?.*$/, "");
    const match = clean.match(/(?:^|\/)((?:src|app|apps|libs|packages|pages|components)\/.+)$/);
    return match ? match[1] : clean.replace(/^\//, "");
  }

  /** A path inside the page's folder as `./…`, so the long prefix is written once. */
  function relativeTo(page, file) {
    const folder = page?.slice(0, page.lastIndexOf("/") + 1);
    return folder && file.startsWith(folder) ? `./${file.slice(folder.length)}` : file;
  }

  function at(place, page) {
    const file = shortPath(place.file);
    return `${relativeTo(page, file)}${place.line ? `:${place.line}` : ""}`;
  }

  function selectorPart(node, exact) {
    if (node.id) return `#${CSS.escape(node.id)}`;
    const tag = node.tagName.toLowerCase();
    const classes = Array.from(node.classList).slice(0, 2).map((name) => `.${CSS.escape(name)}`);
    const twins = Array.from(node.parentElement?.children ?? []).filter((n) => n.tagName === node.tagName);
    const position = exact && twins.length > 1 ? `:nth-of-type(${twins.indexOf(node) + 1})` : "";
    return tag + classes.join("") + position;
  }

  /**
   * The shortest path from the element up that points at it and nothing else.
   * Positions are added only when names alone match several elements.
   */
  function selectorOf(element, exact = false) {
    let selector = selectorPart(element, exact);
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (document.querySelectorAll(selector).length === 1) return selector;
      selector = `${selectorPart(node, exact)} > ${selector}`;
    }
    if (document.querySelectorAll(selector).length === 1 || exact) return selector;
    return selectorOf(element, true);
  }

  function styleOf(element) {
    if (!hasOwnText(element)) return undefined;
    const style = getComputedStyle(element);
    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    return `${style.fontSize}/${style.lineHeight}, ${style.fontWeight}, ${family}`;
  }

  /** One line, so it reads as part of the sentence it is pasted into. */
  function selectionText(level, number) {
    const element = level.el;
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const name = text || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
    const page = shortPath(level.page ?? levels.find((item) => item.page)?.page);
    const where = page ?? (location.pathname + location.hash);

    const parts = [`[${number}] Pick on ${where}`];
    if (level.component) {
      const own = level.file ? ` (${relativeTo(page, shortPath(level.file))})` : "";
      const placed = level.placed ? `, placed at ${at(level.placed, page)}` : "";
      parts.push(`Component: ${level.name}${own}${placed}`);
    } else {
      const source = level.source ?? htmlSource(element);
      parts.push(`Element: ${level.name}${source ? ` at ${at(source, page)}` : ""}`);
      if (!source) parts.push(`Selector: ${selectorOf(element)}`);
    }
    // Only a short label tells instances apart; a container's text is noise.
    if (name && name.length <= MAX_LABEL) parts.push(`Text: "${name}"`);
    const style = styleOf(element);
    if (style) parts.push(`Style: ${style}`);
    return parts.join(" \u00b7 ");
  }

  function copyText(text) {
    let clipboardCopy;
    try {
      if (navigator.clipboard?.writeText) {
        clipboardCopy = navigator.clipboard.writeText(text).then(
          () => true,
          () => false,
        );
      }
    } catch {
      // Sandboxed iframes can deny clipboard access; the fallback covers them.
    }

    // Run the fallback synchronously while the click still carries user activation.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;opacity:0";
    document.documentElement.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let fallbackCopied = false;
    try {
      fallbackCopied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }

    return fallbackCopied ? Promise.resolve(true) : (clipboardCopy ?? Promise.resolve(false));
  }

  function nextPickNumber() {
    if (Date.now() - lastPickAt > PICK_RESET_MS) pickCount = 0;
    lastPickAt = Date.now();
    return ++pickCount;
  }

  async function onPick(event) {
    event.preventDefault();
    event.stopPropagation();
    updateHover(event.clientX, event.clientY);
    const level = selected();
    if (!level) {
      showStatus("Nothing here");
      return;
    }

    const number = nextPickNumber();
    const copied = await copyText(selectionText(level, number));
    if (copied) {
      showStatus(`Copied [${number}] ${level.name}`);
      setActive(false);
    } else {
      pickCount -= 1; // the number was not used
      showStatus("Copy failed, click again");
    }
  }

  // ---------- Rendering ----------

  function renderMark() {
    const level = selected();
    mark.hidden = !active || !level;
    if (mark.hidden) return;
    const rect = level.el.getBoundingClientRect();
    mark.style.left = `${rect.x}px`;
    mark.style.top = `${rect.y}px`;
    mark.style.width = `${rect.width}px`;
    mark.style.height = `${rect.height}px`;
    mark.classList.toggle("label-inside", rect.y < 28);
    label.textContent = level.name;
  }

  function renderBar() {
    bar.hidden = !active && !status;
    if (bar.hidden) return;
    if (status) {
      bar.innerHTML = "<b></b>";
      bar.firstChild.textContent = status;
      return;
    }
    bar.innerHTML = `<span class="hint">
      <span><kbd>W</kbd>parent</span>
      <span><kbd>S</kbd>child</span>
      <span><kbd>Click</kbd>copy [${pickCount + 1}]</span>
      <span><kbd>R</kbd>restart</span>
      <span><kbd>Esc</kbd>exit</span>
    </span>`;
  }

  function showStatus(message) {
    status = message;
    renderBar();
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status = "";
      renderBar();
    }, STATUS_MS);
  }

  catcher.addEventListener("mousemove", (event) => updateHover(event.clientX, event.clientY));
  catcher.addEventListener("click", onPick, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", () => active && renderMark(), true);
  window.addEventListener("resize", () => active && renderMark());
})();
