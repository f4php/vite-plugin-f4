# Vite plugin for f4

This is a Vite plugin for [F4](https://github.com/f4php/f4), a lightweight web development framework.

It provides support for running [Vite](https://vite.dev/) development server as an HMR-enabled proxy to a PHP application written with F4, as well as for custom Pug tags `vite:resource` and `vite:bundle` to simplify integration between server-rendered pages and bundled Vue/CSS/JS resources.

## Installation

```bash
npm install vite-plugin-f4 --save-dev
```

## Usage

Add the plugin to your Vite configuration with sensible defaults from other configuration files:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import f4 from 'vite-plugin-f4';
import { extra as composerExtra } from './composer.json';
import packageJson from './package.json';

export default defineConfig({
  plugins: [
    f4({
        backendUrl: composerExtra.f4.environments.local.server,
        dependencies: Object.keys(packageJson.dependencies)
    })
  ],
});
```

## Vue support

Plugin supports seamless integration of Vue Single File Components. Be sure to enable Vite support for Vue in order to use this feature:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import f4 from 'vite-plugin-f4';
import { extra as composerExtra } from './composer.json';
import packageJson from './package.json';

export default defineConfig({
    plugins: [
        vue(),
        f4({
            backendUrl: composerExtra.f4.environments.local.server,
            dependencies: Object.keys(packageJson.dependencies)
        })
    ]
});
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `backendUrl` | `'http://localhost:8080'` | URL of the PHP/F4 backend server |
| `pugPaths` | `['templates/**/*.pug', 'vendor/f4php/framework/templates/**/*.pug']` | Glob patterns to scan for `vite:resource` tags |
| `outDir` | `'./public/assets'` | Build output directory |
| `base` | `'./'` | Base URL for assets |
| `host` | `'localhost'` | Dev server host |
| `port` | `5173` | Dev server port |
| `dependencies` | `[]` | NPM package names to alias through Vite's module resolver |
| `neverProxy` | *(see source)* | Paths and regexps that are never proxied to the backend |
| `setups` | `{}` | Named setup code for Vue component initialization |
| `debug` | `false` | Enable verbose debug logging |

## Pug tag workflow

The plugin introduces two complementary Pug tags that together connect your Vite build to F4 server-rendered pages:

- **`vite:resource`** — placed in any Pug template to declare which JS, CSS, or Vue files belong to a named bundle. Scanned and processed by vite-plugin-f4 at build/dev time.
- **`vite:bundle`** — placed in the `<head>` of a page template to render the resulting `<script>` and `<link>` tags for a bundle. Processed at request time by the F4 framework.

A typical page template looks like this:

```pug
//- Declare resources (can be in any template file, including partials)
vite:resource(src="./styles/main.css" bundle="default")
vite:resource(src="./components/App.vue" element="#app" name="app" bundle="default")

//- Render the bundle in the page <head>
html
  head
    vite:bundle(name="default")
  body
    #app
```

## The `vite:resource` tag

Declares a file to be included in a named bundle.

### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `src` | Yes | Path to the resource file, relative to the template |
| `bundle` | No | Bundle name (default: `"default"`) |
| `name` | Conditional | Import identifier; required for `.vue` files |
| `element` | Conditional | CSS selector of the DOM element to mount a Vue SFC into |
| `custom-element` | Conditional | Custom element tag name to register as a Web Component |
| `setup` | No | Comma-separated named setup function keys (from `setups` in vite.config.js) or path to a file containing setup code (skips `setups` from vite.config.js entirely) |

**Rules for Vue SFCs:**
- One of `element` or `custom-element` is required, along with `name`
- `element` and `custom-element` are mutually exclusive
- Custom elements should use the `.ce.vue` filename extension to ensure stylesheet information is injected into the shadow DOM automatically

### Examples

```pug
//- Simple CSS or JS import
vite:resource(src="./styles/global.css")
vite:resource(src="./scripts/analytics.js")

//- Vue SFC mounted to a DOM element
vite:resource(
  src="./components/MyWidget.vue"
  element="#my-widget"
  name="my-widget"
)

//- Vue custom element (Web Component)
vite:resource(
  src="./components/MyElement.ce.vue"
  custom-element="my-custom-element"
  name="my-custom-element"
)

//- Multiple resources grouped in a named bundle
vite:resource(src="./styles/admin.css" bundle="admin")
vite:resource(src="./components/Dashboard.vue" element="#dashboard" name="dashboard" bundle="admin")

//- Vue SFC with setup functions
vite:resource(
  src="./components/App.vue"
  element="#app"
  name="app"
  setup="primevue,pinia"
)
```

## The `vite:bundle` tag

Renders `<script>` and `<link>` tags for a bundle into the page. This tag is provided by the F4 framework (not vite-plugin-f4 itself) and is processed at request time by the PHP Phug module.

In **development mode**, it serves virtual modules directly from the Vite dev server with HMR support. In **production mode**, it outputs hashed asset URLs from the Vite manifest.

### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | Bundle name to render (matches the `bundle` attribute on `vite:resource`) |
| `preload` | No (flag) | Adds `rel="preload"` tags for CSS and JS to improve load performance |
| `with-sri` | No | Adds Subresource Integrity hashes (`"sha256"`, `"sha384"`, `"sha512"`) |

Child `<link>` and `<script>` nodes can be provided to customise the output tag attributes.

### Examples

```pug
//- Basic bundle
head
  vite:bundle(name="default")

//- With resource preloading
head
  vite:bundle(name="default" preload)

//- With Subresource Integrity
head
  vite:bundle(name="default" with-sri="sha384")

//- Custom output tag attributes
head
  vite:bundle(name="default")
    link(blocking="render" rel="stylesheet")
    script(blocking="render" type="module")
```

## Setup functions

The `setups` configuration option maps short noun-based names to setup function files. Setup functions are applied during Vue app or custom element initialization and allow middleware-style composition of plugins, stores, themes, and other app-level configuration.

```javascript
// vite.config.js
f4({
  setups: {
    pinia:    './src/setup/pinia.js',
    i18n:     './src/setup/i18n.js',
    primevue: './src/setup/primevue.js',
  }
})
```

Reference setup keys in the `setup` attribute of `vite:resource`:

```pug
vite:resource(
  src="./components/App.vue"
  element="#app"
  name="app"
  setup="primevue,pinia"
)
```

Each setup module exports a default function that receives and returns the Vue app instance:

```javascript
// src/setup/pinia.js
import { createPinia } from 'pinia';
export default function(app) {
  app.use(createPinia());
  return app;
}
```

## HMR behavior

> **Note:** HMR requires at least one `vite:bundle` tag to be present in your Pug templates.

| File change | Behavior |
|-------------|----------|
| `.pug` file containing `vite:resource` or `vite:bundle` | Vite server restart + full page reload |
| Any other `.pug` file change | Full page reload |
| `.php` file change | Full page reload |
| JS, CSS, Vue, or other asset change | Vite attempts a standard HMR update without full page reload |

## Asset output

Built assets are written to `outDir` with content hashes for cache busting:

| Output type | Filename pattern |
|-------------|-----------------|
| JS chunks | `[name].[hash].js` |
| Bundle entry points | `[name].bundle.[hash].js` |
| CSS and other assets | `[name].bundle.[hash].[ext]` |

A Vite manifest is generated automatically at `{outDir}/.vite/manifest.json` and is used by the F4 framework to resolve hashed asset paths at runtime.

## Build

To build the plugin for distribution, run:

```bash
npm run build
```

## License

MIT
