import path from 'path';
import { glob } from 'glob';
import fs from 'fs';
import lex from 'pug-lexer';
import parse from 'pug-parser';

function extractTags(node, pattern, results = []) {
  if (node.type === 'Tag' && node.name.match(pattern)) {
    results.push(node);
  }
  if (node.nodes) {
    node.nodes.forEach(child => extractTags(child, pattern, results));
  }
  else if (node.block && node.block.nodes) {
    node.block.nodes.forEach(child => extractTags(child, pattern, results));
  }
  return results;
}

function extractAttributes(node) {
  const result = {};
  if (node.attrs) {
    node.attrs.forEach((attribute) => {
      if (attribute.name === 'src') {
        result.src = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute.name === 'bundle') {
        result.bundle = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute.name === 'mount') {
        result.mount = stripQuotesAndTrim(attribute.val);
      }
    });
  }
  return result;
}

function toCamelCase(identifier) {
  return identifier.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
}

function locateEntryPoints(pugTemplates, root) {
  const entryPoints = {};
  const defaultBundleName = 'default';
  const files = glob.sync(pugTemplates, { root });
  const lexPlugins = [
    {
      // this hack prevents lexer from throwing a syntax error on php expression syntax
      isExpression(expr) {
        return true;
      }
    }
  ];
  for (const file of files) {
    const pug = fs.readFileSync(file, 'utf-8');
    const ast = parse(lex(pug, {
      filename: file,
      plugins: lexPlugins
    }));
    const nodes = extractTags(ast, /^vite\:resource$/);
    nodes.forEach((node) => {
      const attrs = extractAttributes(node);
      if (attrs.src) {
        const bundle = attrs.bundle ?? defaultBundleName;
        if (!entryPoints[bundle]) {
          entryPoints[bundle] = [];
        }
        if (attrs.src.endsWith('.vue')) {
          if (!attrs.mount && !attrs.name) {
            throw new Error('Missing "mount" and "name" attributes, but one of them required for SFC resources');
          }
          entryPoints[bundle].push({
            path: path.resolve(path.dirname(file), attrs.src),
            element: attrs.mount ?? null,
            name: toCamelCase(attrs.name ?? attrs.mount),
            type: 'vue-sfc'
          });
        }
        else {
          entryPoints[bundle].push({
            path: path.resolve(path.dirname(file), attrs.src),
            type: 'simple'
          });
        }
      }
    });
  }
  return entryPoints;
}

function generateRollupInputs(entryPoints) {
  const input = {};
  for (const [bundle, points] of Object.entries(entryPoints)) {
    const importStatements = [
      `import 'vite/modulepreload-polyfill';`,
      (points.filter((point) => point?.type === 'vue-sfc').length ? `import { defineCustomElement } from 'vue';` : null),
      ...points
    ]
      .map((point) => {
        if (point?.type === 'simple') {
          return `import '${point.path.replace(/\\/g, '/')}';`;
        }
        else if (point?.type === 'vue-sfc') {
          return [
            `import ${point.name} from '${point.path.replace(/\\/g, '/')}';`,
            point.element ? `customElements.define('${point.element}', defineCustomElement(${point.name}));` : null
          ].join('\n');
        }
        else if (point) {
          return point;
        }
      })
      .filter(point => point)
      .join('\n');
    input[bundle] = importStatements;
  }
  return input;
}

function stripQuotesAndTrim(string) {
  return string.replace(/^([\'\"])\s*(.+)\s*\1$/, '$2');
}

function getShortName(file, root) {
  return file.startsWith(root + '/') ? path.posix.relative(root, file) : file
}

const createConfigPlugin = ({ outDir, host, port, backendUrl }) => {
  return {
    name: 'vite-plugin-f4-config',
    config(config, { command }) {
      return {
        ...config,
        ...{
          publicDir: false,
          build: {
            manifest: true,
            outDir,
            cssCodeSplit: true,
            rollupOptions: {
              output: [
                {
                  chunkFileNames: `[name].[hash].js`,
                  entryFileNames: "[name].bundle.[hash].js",
                  assetFileNames: "[name].bundle.[hash].[ext]",
                }
              ]
            }
          },
          server: {
            host,
            port,
            strictPort: true,
            proxy: {
              '^\/(?!(\@vite)|(@id)|(@fs)|(node_modules)).*$': {
                xfwd: true,
                headers: {
                  'X-Vite-Devserver': true
                },
                target: `http://${backendUrl}`
              }
            }
          }
        }
      };
    }
  };
}

const createVirtualEntryPointsPlugin = ({ pugPaths, root }) => {
  if (!pugPaths) {
    return;
  }
  const PREFIX = `\0virtual:f4/`;
  const entryPoints = locateEntryPoints(pugPaths, root);
  const modules = generateRollupInputs(entryPoints);
  const externalModules = {};
  return {
    name: 'vite-plugin-f4-virtual-entry-points',
    config(config, { command }) {
      config.build ??= {};
      config.build.rollupOptions ??= {};
      if (config.build.rollupOptions.input instanceof Array) {
        config.build.rollupOptions.input = [
          ...config.build.rollupOptions.input,
          ...Object.keys(modules)
        ];
      }
      else if (config.build.rollupOptions.input instanceof Object) {
        // we need to save paths to use later in the resolveId
        Object.entries(config.build.rollupOptions.input).map(([key, value]) => { externalModules[key] = value });
        config.build.rollupOptions.input = [
          ...Object.keys(config.build.rollupOptions.input),
          ...Object.keys(modules)
        ];
      }
      else {
        config.build.rollupOptions.input = [
          config.build.rollupOptions.input,
          ...Object.keys(modules)
        ].filter(v => v);
      }
    },
    resolveId(id) {
      if (id in modules) {
        return `${PREFIX}${id}`;
      }
      else if (id in externalModules) {
        return externalModules[id];
      }
    },
    load(id) {
      if (id.startsWith(PREFIX)) {
        return modules[id.slice(PREFIX.length)];
      }
    },
    handleHotUpdate({ type, file, server, modules }) {
      if (type === 'update' && (file.endsWith('.pug') || file.endsWith('.php'))) {
        server.restart(true).then(() => {
          server.ws.send({ type: 'full-reload', path: '*' });
        });
      }
    }
  }
}

const createDependenciesAliasesPlugin = ({ dependencies }) => {
  return {
    name: 'vite-plugin-f4-module-aliases',
    config(config, { command }) {
      return {
        resolve: {
          alias: {
            ...dependencies
              .reduce((aliases, module) => {
                  aliases[module] = path.resolve(`./node_modules/${module}`);
                  return aliases;
              }, {})
          }
        }
      }
    }
  };
}

export default function vitePluginF4(options) {
  const {
    pugPaths = [
      'templates/**/*.pug',
      'vendor/f4php/framework/templates/**/*.pug'
    ],
    outDir = './public/assets',
    root = process.cwd(),
    host = 'localhost',
    port = 5173,
    backendUrl = 'localhost:8080',
    dependencies = []
  } = options;
  return [
    createConfigPlugin({ outDir, host, port, backendUrl }),
    createVirtualEntryPointsPlugin({ pugPaths, root }),
    createDependenciesAliasesPlugin( { dependencies })
  ]
}
