# Vite plugin for f4

This is a Vite plugin for [F4](https://github.com/f4php/f4), a lightweight web development framework.

It provides support for running [Vite](https://vite.dev/) development server as an HMR-enabled proxy to php application written with F4, as well as for custom pug tags such as `vite:include` and `vite:bundle` to simplify integration between server-rendered pages and bundled vue/css/js resources.

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

Plugin supports seamless integration of Vue's Single File Components, be sure to enable Vite support for Vue in order to use this feature:

```javascript

// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import f4 from 'vite-plugin-f4';
import { extra as composerExtra } from './composer.json';
import packageJson from './package.json';

export default defineConfig({
    plugins: [
        vue({
        }),
        f4({
            backendUrl: composerExtra.f4.environments.local.server,
            dependencies: Object.keys(packageJson.dependencies)
        })
    ]
});
```


## Build

To build the plugin for distribution, run:

```bash
npm run build
```

## License

MIT
