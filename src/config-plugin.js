const createConfigPlugin = ({ outDir, base, host, port, backendUrl }) => {
  return {
    name: 'vite-plugin-f4-config',
    config(config, { command }) {
      const escapeRegexp = /[/\-\\^$*+?.()|[\]{}]/g;
      const neverViaProxyPaths = [
        '@vite',
        '@id',
        '@fs',
        'node_modules',
        ]
        .map(path => path.replace(escapeRegexp, '\\$&'))
        .map(path => `(${path})`)
        .join('|');
      const proxyRegexp = '^\/(?!'+neverViaProxyPaths+').*$';
      return {
        ...config,
        ...{
          publicDir: false,
          base,
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
              [proxyRegexp]: {
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

export default createConfigPlugin;