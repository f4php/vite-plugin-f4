import createConfigPlugin from './config-plugin.js';
import createDependenciesAliasesPlugin from './dependencies-aliases-plugin.js';
import createFixImportAnalysisPlugin from './fix-import-analysis-plugin.js';
import createVirtualEntryPointsPlugin from './virtual-entry-points-plugin.js';
import InjectClientPlugin from './inject-client-plugin.js';
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
    neverProxy = [
      '/@vite',
      '/@id',
      '/@fs',
      '/node_modules'
    ],
  } = options;
  return [
    createConfigPlugin({ outDir, base }),
    createVirtualEntryPointsPlugin({ pugPaths, prefix, host, port, backendUrl, neverProxy }),
    createDependenciesAliasesPlugin( { dependencies }),
    InjectClientPlugin({ neverProxy }),
    appendFinalPluginPlugin({plugin: createFixImportAnalysisPlugin, options: {prefix}}),
  ]
}

export default vitePluginF4;