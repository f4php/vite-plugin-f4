const createConfigPlugin = ({ outDir, base }) => {
  return {
    name: 'vite-plugin-f4-config',
    config(config) {
      return {
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
          }
        },
        ...config
      };
    }
  };
}

export default createConfigPlugin;