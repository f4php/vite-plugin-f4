import createConfigPlugin from './config-plugin.js';
import createDependenciesAliasesPlugin from './dependencies-aliases-plugin.js';
import createFixImportAnalysisPlugin from './fix-import-analysis-plugin.js';
import createVirtualEntryPointsPlugin from './virtual-entry-points-plugin.js';
import appendFinalPluginPlugin from './append-final-plugin-plugin.js';

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
    stylesheetFilenameRegexp = /^.+\.(css|scss|styl|stylus)$/,
    inlineAssetsUrlRegexp = /\/templates\/.+\.(svg|jpg|jpeg|png|gif|webp|avif|woff|woff2|ttf|otf|eot|mp4|webm|ogg|cur|ico)/,
    neverProxy = [
      '/@vite',
      '/@id',
      '/@fs',
      '/node_modules',
      '/vendor/f4php/framework',
      '/templates',
    ],
    debug = false,
  } = options;
  return [
    createConfigPlugin({ outDir, base }),
    createVirtualEntryPointsPlugin({ pugPaths, prefix, host, port, backendUrl, neverProxy, debug }),
    createDependenciesAliasesPlugin({ dependencies, debug }),
    appendFinalPluginPlugin({ plugin: createFixImportAnalysisPlugin, options: { prefix, inlineAssetsUrlRegexp, stylesheetFilenameRegexp, debug } }),
  ]
}

export default vitePluginF4;