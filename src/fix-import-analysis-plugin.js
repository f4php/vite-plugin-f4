function createFixImportAnalysisPlugin(options, config) {
  return {
    name: 'vite-plugin-f4-fix-import-analysis',
    handleHotUpdate({ type, file, server }) {
      if(type==='update' && file.startsWith(config.root)) {
        const targetModule = server.moduleGraph.getModuleById(file);
        targetModule.url = `/@fs${file}`;
      }
    },
    transform(code, id) {
      if(id.startsWith(options.prefix)) {
        return code.replace(/import\s+\"(?!\/@)(\/.+)\";/g, `import "/@fs${config.root}$1";`);
      }
      else if (id.startsWith(config.root) && !id.startsWith(config.root+'/node_modules')) {
        const relativePath = id.slice(config.root.length);
        const regexp = new RegExp(`__vite__createHotContext\\("${relativePath}"\\)`, "g");
        const replacement = `__vite__createHotContext("/@fs${id}")`;
        return code.replace(regexp, replacement)
      }
    },
  };
}

export default createFixImportAnalysisPlugin;