import createConfigPlugin from './config-plugin.js';
import createDependenciesAliasesPlugin from './dependencies-aliases-plugin.js';
import createFixImportAnalysisPlugin from './fix-import-analysis-plugin.js';
import createVirtualEntryPointsPlugin from './virtual-entry-points-plugin.js';
import addFinalPluginPlugin from './append-final-plugin-plugin.js';

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
    backendUrl = 'localhost:8080',
    dependencies = [],
    prefix = `\0virtual:f4/`
  } = options;
  return [
    createConfigPlugin({ outDir, base, host, port, backendUrl }),
    createVirtualEntryPointsPlugin({ pugPaths, prefix }),
    createDependenciesAliasesPlugin( { dependencies }),
    addFinalPluginPlugin({plugin: createFixImportAnalysisPlugin, options: {prefix}}),
  ]
}

export default vitePluginF4;