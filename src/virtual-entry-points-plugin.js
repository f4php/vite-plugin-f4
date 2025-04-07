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
      else if (attribute.name === 'element') {
        result.element = stripQuotesAndTrim(attribute.val);
      }
    });
  }
  return result;
}

function toCamelCase(identifier) {
  return identifier.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
}

function locateEntryPoints(pugTemplates, debug) {
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
          if (!attrs.element && !attrs.name) {
            throw new Error(`Missing "element" and "name" attributes, but one of them required for SFC resources in ${file}:${node.line}`);
          }
          entryPoints[bundle].push({
            path: path.resolve(path.dirname(file), attrs.src),
            element: attrs.element ?? null,
            name: toCamelCase(attrs.name ?? attrs.element),
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
  if(debug) {
    console.debug(`Located entrypoints:`, entryPoints);
  }
  return entryPoints;
}

function generateRollupInputs(entryPoints, debug) {
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
  if (debug) {
    console.debug(`Configured bundles:`, input);
  }
  return input;
}

function stripQuotesAndTrim(string) {
  return string.replace(/^([\'\"])\s*(.+)\s*\1$/, '$2');
}

const createVirtualEntryPointsPlugin = ({ pugPaths, prefix, host, port, backendUrl, neverProxy, debug }) => {
  if (!pugPaths) {
    return;
  }
  const PREFIX = prefix;
  const pugEntryPoints = locateEntryPoints(pugPaths, debug);
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
      else if(config.build.rollupOptions.input) {
        [config.build.rollupOptions.input].map((value) => { configEntryPoints[value] = null; });
      }
      config.build.rollupOptions.input = Object.keys({
        ...configEntryPoints,
        ...virtualEntryPoints
      });
      const escapeRegexp = /[/\-\\^$*+?.()|[\]{}]/g;
      const neverViaProxyPaths = [
        ...neverProxy,
        ...Object.keys(configEntryPoints),
        ]
        .map(path => path.replace(escapeRegexp, '\\$&'))
        .map(path => `(${path})`)
        .join('|');
      const proxyRegexp = '^(?!'+neverViaProxyPaths+').*$';
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
        if(neverProxy.find(url => req.url.startsWith(url))) {
          return next(); 
        }
        // const originalWrite = res.write;
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
          // virtual endpoint resources are passed here as strings, 
          // so we only process proxied content from the backend, 
          // which is an array of Buffers
          if(chunks.every(c => Buffer.isBuffer(c))) {
            let body = Buffer.concat(chunks).toString('utf8');
            if (res.getHeader('content-type')?.includes('text/html')) {
              if (!body.includes('/@vite/client')) {
                body = body.replace('</head>', `<script type="module" src="/@vite/client"></script></head>`);
              }
            }
            res.setHeader('content-length', Buffer.byteLength(body));
            originalEnd.call(res, body);
          }
          else {
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
            if(content?.includes('vite:bundle') || content?.includes('vite:resource')) {
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