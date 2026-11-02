# Installing the annotation tool

Instructions for a coding agent. The user gave you this repo and wants the annotation layer on top of their project.

## 1. Ask for a colour

Ask once, before you change anything, and offer these options:

- `lemon`: highlighter yellow, the default
- `pink`
- `mint`
- `sky`
- any hex value

If the project has a strong accent colour, suggest a preset that stands apart from it, so the highlight is easy to see. If the user does not care, use `lemon`.

## 2. Add it, for development only

The tool must never reach production. Pick the first case that fits.

**Vite project.** Install it and add the plugin before the framework plugin. The plugin only runs on the dev server, and it adds template lines for Vue.

```bash
npm i -D github:ryadovoys/annotation-tool
```

```js
import annotationTool from "annotation-tool/vite";

export default defineConfig({
  plugins: [annotationTool({ color: "lemon" }), vue()],
});
```

**Plain HTML page or prototype.** Add one line before `</body>`. Skip `data-color` for lemon.

```html
<script data-color="mint" src="https://cdn.jsdelivr.net/gh/ryadovoys/annotation-tool@1/annotation-tool.js"></script>
```

If the page will be published, tell the user to remove this line first.

**A page that cannot load external scripts** (a sandboxed preview, a strict CSP, an artifact). Paste the content of `annotation-tool.js` into an inline `<script>` tag.

**Any other framework** (Next.js, Nuxt, Astro and so on). Copy `annotation-tool.js` into the folder for static files, then load it only in development. For example in Next.js, in the root layout:

```jsx
{process.env.NODE_ENV === "development" && <script src="/annotation-tool.js" />}
```

## 3. Check it

Run the project, press Option+Shift+C, and tell the user it is ready. If they use a browser pane without keyboard focus, they need to click the page first.

Do not change the project's own styles. The tool lives in a shadow root and needs nothing else.

## Reading a pick

A pick pasted into chat looks like this:

```
[1] Pick on src/Pricing.vue · Component: Card (./Card.vue), placed at ./Pricing.vue:4 · Text: "Starter"
```

- `[1]` is the number. The user refers to it in their message.
- `Pick on` is the page.
- `(./Card.vue)` is the component's own file. `placed at` is where it is used and given its props. Change the first to change every card, the second to change this one.
- Paths starting with `./` are relative to the page's folder.
- `Element:` means a plain element, not a component. `Selector:` appears when no line is known.
- `Text:` tells apart instances of the same component.
- `Style:` is size/line height, weight and font of the text.
