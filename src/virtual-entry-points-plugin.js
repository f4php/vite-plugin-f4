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
      if (attribute?.name === 'src') {
        result.src = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute?.name === 'bundle') {
        result.bundle = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute?.name === 'element') {
        result.element = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute?.name === 'custom-element') {
        result.customElement = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute?.name === 'name') {
        result.name = stripQuotesAndTrim(attribute.val);
      }
      else if (attribute?.name === 'setup') {
        result.setup = stripQuotesAndTrim(attribute.val);
      }
    });
  }
  return result;
}

function toCamelCase(identifier) {
  return identifier?.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
}

function locateEntryPoints(pugTemplates, setups, debug) {
  const entryPoints = {};
  const defaultBundleName = 'default';
  const files = glob.sync(pugTemplates);
  const lexPlugins = [
    {
      // this hack prevents lexer from throwing a syntax error on php expression syntax
      isExpression(expr) {
        return true;
      }
    }
  ];
  for (const file of files) {
    try {
      const pug = fs.readFileSync(file, 'utf-8');
      const ast = parse(lex(pug, {
        filename: file,
        plugins: lexPlugins
      }));
      const nodes = extractTags(ast, /^vite\:resource$/);
      nodes.forEach((node) => {
        const attrs = extractAttributes(node);
        if (attrs?.src) {
          const bundle = attrs?.bundle ?? defaultBundleName;
          if (!entryPoints[bundle]) {
            entryPoints[bundle] = [];
          }
          if (attrs.src.endsWith('.vue')) {
            if (!attrs?.element && !attrs?.customElement && !attrs?.name) {
              throw new Error(`Missing "element" or "custom-element" and "name" attributes, but one of them required for SFC resources in ${file}:${node.line}`);
            }
            if (attrs?.element && attrs?.customElement) {
              throw new Error(`Either "element" or "custom-element" may be used for SFC resources in ${file}:${node.line}`);
            }
            const pointSetups = attrs?.setup ? attrs
              .setup
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
              .map(v => setups?.[v] ?? v)
              : [];
            entryPoints[bundle].push({
              path: path.resolve(path.dirname(file), attrs?.src),
              element: attrs?.element,
              customElement: attrs?.customElement,
              name: toCamelCase(attrs?.name ?? attrs?.element ?? attrs?.customElement ?? ''),
              type: 'vue-sfc',
              setups: pointSetups,
            });
          }
          else {
            entryPoints[bundle].push({
              path: path.resolve(path.dirname(file), attrs.src),
              type: 'simple',
              name: toCamelCase(attrs.name??''),
            });
          }
        }
      });
    }
    catch(e) {
      console.error(`\x1b[31m Failed to parse ${file}\n` + e);
    }
  }
  if (debug) {
    console.debug(`Located entrypoints:`, entryPoints);
  }
  return entryPoints;
}

function generateRollupInputs(entryPoints, debug) {
  const input = {};
  for (const [bundle, points] of Object.entries(entryPoints)) {
    const lines = [
      `import path from 'path';`,
      `import 'vite/modulepreload-polyfill';`,
      (points.filter((point) => point?.type === 'vue-sfc' && point?.element).length ? `import { createApp } from 'vue';` : null),
      (points.filter((point) => point?.type === 'vue-sfc' && point?.customElement).length ? `import { defineCustomElement } from 'vue';` : null),
      ...points
    ]
      .map((point) => {
        // "?bundle=..."" portion prevents rollup from overoptimizing and stripping repetitive css during production build
        if (point?.path && (point?.type === 'simple') && point?.name) {
          return `import ${point?.name} from '${point?.path.replace(/\\/g, '/')}?bundle=${encodeURIComponent(bundle)}';`;
        }
        else if (point?.path && point?.type === 'simple') {
          return `import '${point?.path.replace(/\\/g, '/')}?bundle=${encodeURIComponent(bundle)}';`;
        }
        // normal element mount
        else if (point?.path && point?.type === 'vue-sfc' && point?.name && point?.element) {
          const lines = [];
          lines.push(
            `import ${point.name} from '${point.path.replace(/\\/g, '/')}?bundle=${encodeURIComponent(bundle)}';`
          );
          const el = point.element;
          let appExpr = `createApp(${point.name}, { ...document.querySelector('${el}')?.dataset || {} })`;
          if(point?.setups) {
            point.setups.forEach((setupPath, i) => {
              lines.push(`import __setup_${point.name}_${i} from '${path.resolve(setupPath).replace(/\\/g, '/')}';`);
              appExpr = `__setup_${point.name}_${i}(${appExpr})`;
            });
          }
          lines.push(
            `if (document.querySelector('${el}')) { ${appExpr}.mount(document.querySelector('${el}')); }`
          );
          return lines.join('\n');
        }
        // custom element mount
        else if (point?.path && point?.type === 'vue-sfc' && point?.name && point?.customElement) {
          const lines = [];
          lines.push(
            `import ${point.name} from '${point.path.replace(/\\/g, '/')}?bundle=${encodeURIComponent(bundle)}';`
          );
          const el = point.element;
          let appExpr = `createApp(${point.name}, { ...document.querySelector('${el}')?.dataset || {} })`;
          if(point?.setups) {
            point.setups.forEach((setupPath, i) => {
              lines.push(`import __setup_${point.name}_${i} from '${path.resolve(setupPath).replace(/\\/g, '/')}';`);
              appExpr = `__setup_${point.name}_${i}(${appExpr})`;
            });
            // With setups — compose all setups into the callback
            lines.push(
              `customElements.define('${point.customElement}', defineCustomElement(${point.name}, {`,
              `  configureApp(app) {`,
              ...point.setups.map((_, i) => `    __setup_${point.name}_${i}(app);`),
              `  }`,
              `}));`,
            );
          } else {
            // No setups — plain registration as before
            lines.push(
              `customElements.define('${point.customElement}', defineCustomElement(${point.name}));`
            );
          }

          if (!point.path.match(/\.ce\.vue$/)) {
            lines.push(
              `console.warn('Custom element ${point.customElement} must use ".ce.vue" filename extension to make sure stylesheet information is injected into shadow dom automatically');`
            );
          }

          return lines.join('\n');
        }
        // global property (discouraged)
        else if (point?.path && point?.type === 'vue-sfc' && point?.name && !point?.element) {
          return [
            `import ${point.name} from '${point.path.replace(/\\/g, '/')}?bundle=${encodeURIComponent(bundle)}';`,
            `window.${point.name} = ${point.name};`,
            `console.warn('window.${point.name} was created due to missing \`element\` or \`custom-element\` on vite:resource tag, this pollutes the global namespace and is discouraged; bind the imported resource to html tag by specifying either \`element\` or \`custom-element\` attribute to hide this warning');`,
          ].join('\n');
        }
        else if (typeof point === 'string') {
          return point;
        }
        else if (point !== null) {
          console.error(`\x1b[31m Unexpected entry point object: `, point)
        }
      })
      .filter(point => point)
      .join('\n');
    input[bundle] = lines;
  }
  if (debug) {
    console.debug(`Configured bundles:`, input);
  }
  return input;
}

function stripQuotesAndTrim(string) {
  return string?.replace(/^([\'\"])\s*(.+)\s*\1$/, '$2');
}

function createRegExp(paths) {

    const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

    const neverViaProxyPaths = paths
      .filter(entry => !(entry instanceof RegExp))
      .map(path => `(${escapeRegExp(path)})`);
    const neverViaProxyRegExps = paths
      .filter(entry => entry instanceof RegExp)
      .map(path => `(${path.source})`);

    return new RegExp(`^(?!${[...neverViaProxyPaths, ...neverViaProxyRegExps].join('|')}).*$`);
}

const createVirtualEntryPointsPlugin = ({ pugPaths, prefix, host, port, backendUrl, neverProxy, setups, debug }) => {
  if (!pugPaths) {
    return;
  }
  const PREFIX = prefix;
  const pugEntryPoints = locateEntryPoints(pugPaths, setups, debug);
  const virtualEntryPoints = generateRollupInputs(pugEntryPoints, debug);
  const configEntryPoints = {};
  let root;
  return {
    name: 'vite-plugin-f4-virtual-entry-points',
    config(config) {
      config.build ??= {};
      config.build.rollupOptions ??= {};
      if (config.build.rollupOptions.input instanceof Array) {
        config.build.rollupOptions.input.map((value) => { configEntryPoints[value] = null; });
      }
      else if (config.build.rollupOptions.input instanceof Object) {
        Object.entries(config.build.rollupOptions.input).map(([key, value]) => { configEntryPoints[key] = value; });
      }
      else if (config.build.rollupOptions.input) {
        [config.build.rollupOptions.input].map((value) => { configEntryPoints[value] = null; });
      }
      config.build.rollupOptions.input = Object.keys({
        ...configEntryPoints,
        ...virtualEntryPoints
      });
      const proxyRegexp = createRegExp([
        ...neverProxy,
        ...Object.keys(configEntryPoints),
      ]).source;
      if (debug) {
        console.debug(`Configuring live proxy to URL: ${backendUrl}, using regexp: ${proxyRegexp} `);
      }
      return {
        server: {
          host,
          port,
          strictPort: true,
          proxy: {
            [proxyRegexp]: {
              xfwd: true,
              headers: {
                'X-Vite-Devserver': true
              },
              target: backendUrl
            }
          }
        }
      }
    },
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id in virtualEntryPoints) {
        return `${PREFIX}${id}`;
      }
      else if (id in configEntryPoints) {
        return configEntryPoints[id] ? path.resolve(`${root}/${configEntryPoints[id]}`) : id;
      }
    },
    load(id) {
      if (id.startsWith(PREFIX)) {
        return virtualEntryPoints[id.slice(PREFIX.length)];
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url.match(createRegExp(neverProxy))) {
          return next();
        }
        const originalEnd = res.end;
        const chunks = [];
        res.write = function (chunk) {
          chunks.push(chunk);
          return true;
        };
        res.end = function (chunk) {
          if (chunk) {
            chunks.push(chunk);
          }
          const contentType = res.getHeader('Content-Type');
          const isHTML = contentType?.includes('text/html');
          // virtual endpoint resources are passed here as strings,
          // so we only process proxied content from the backend,
          // which is an array of Buffers
          if (chunks.every(c => Buffer.isBuffer(c))) {
            const buffer = Buffer.concat(chunks);
            try {
              if (isHTML) {
                let body = buffer.toString('utf8');
                if (!body.includes('/@vite/client')) {
                  body = body.replace('</head>', `<script type="module" src="/@vite/client"></script></head>`);
                  if(!res.headersSent) {
                    res.setHeader('Content-Length', Buffer.byteLength(body));
                  }
                  originalEnd.call(res, body);
                  return;
                }
              }
              if(!res.headersSent) {
                res.setHeader('Content-Length', buffer.length);
              }
              originalEnd.call(res, buffer);
            }
            catch(e) {
              console.error(e);
            }
          } else {
            // Handle string chunks
            originalEnd.call(res, chunks.join());
          }
        };
        next();
      });
    },
    handleHotUpdate({ type, file, server }) {
      if (type === 'update') {
        if (file?.endsWith('.pug')) {
          if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');
            if (content?.includes('vite:bundle') || content?.includes('vite:resource')) {
              server.restart(true).then(() => {
                server.ws.send({ type: 'full-reload', path: '*' });
              });
            }
            else {
              server.ws.send({ type: 'full-reload', path: '*' });
            }
          }
        }
        else if (file?.endsWith('.php')) {
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      }
    }
  }
}

export default createVirtualEntryPointsPlugin;