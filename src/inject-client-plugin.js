const injectClientPlugin = ({ neverProxy }) => {
  return {
    name: 'vite-plugin-f4-inject-client',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if(neverProxy.find(url => req.url.startsWith(url))) {
          return next(); // Skip non-proxied requests
        }
        const originalWrite = res.write;
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
          let body = Buffer.concat(chunks).toString('utf8');
          if (res.getHeader('content-type')?.includes('text/html')) {
            if (!body.includes('/@vite/client')) {
              body = body.replace('</head>', `<script type="module" src="/@vite/client"></script></head>`);
            }
          }
          res.setHeader('content-length', Buffer.byteLength(body));
          originalEnd.call(res, body);
        };

        next();
      });
    }
  };
}

export default injectClientPlugin;