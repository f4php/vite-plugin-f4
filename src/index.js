import createConfigPlugin from './config-plugin.js';
import createDependenciesAliasesPlugin from './dependencies-aliases-plugin.js';
import createVirtualEntryPointsPlugin from './virtual-entry-points-plugin.js';

function vitePluginF4(options) {
  const {
    pugPaths = [
      'templates/**/*.pug',
      'vendor/f4php/framework/templates/**/*.pug'
    ],
    outDir = './public/assets',
    base = './',
    host = 'localhost',
    port = 5173,
    backendUrl = 'http://localhost:8080',
    dependencies = [],
    prefix = `\0virtual:f4/`,
    neverProxy = [
      '/@vite',
      '/@id',
      '/@fs',
      '/node_modules',
      '/vendor/f4php/framework',
      /\/templates\/.+\.(pug|js|ts|vue|css|scss|styl|stylus|svg|jpg|jpeg|png|gif|webp|avif|woff|woff2|ttf|otf|eot|mp4|webm|ogg|cur|ico|ftl)(\?.*)?/
    ],
    debug = false,
    setups = {},
  } = options;
  console.log('\x1b[33m%s\x1b[0m', 'Please note that you must have at least one vite:bundle statement in your pug templates to enable HMR')
  return [
    createConfigPlugin({ outDir, base }),
    createVirtualEntryPointsPlugin({ pugPaths, prefix, host, port, backendUrl, neverProxy, setups, debug }),
    createDependenciesAliasesPlugin({ dependencies, debug }),
  ]
}

export default vitePluginF4;