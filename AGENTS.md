# Annotation tool

If the user gave you this repo to add the tool to their project, follow [INSTALL.md](INSTALL.md).

If you are working on the tool itself:

- `annotation-tool.js` is the tool. One file, plain JS, no dependencies, no build step. Keep it that way.
- `vite.js` is the dev-only Vite plugin. It injects the tool and stamps Vue template lines.
- All styles live in the shadow root, built from the tokens at the top of `STYLES`.
- Test by hand on `demo/index.html` through a local server, plus a Vue and a React Vite app. Restart Vite after changing the tool, the plugin reads the file once.
- Avoid non-ASCII characters in strings. The page may not declare a charset.
- Public repo. Keep it free of anything from a work project: names, paths, tokens.
