function createFixImportAnalysisPlugin(options, config, oldPlugin) {
  return {
    name: 'vite-plugin-f4-fix-import-analysis',
    transform(code, id) {
      if(id.startsWith(options.prefix)) {
        return code.replace(/import\s+\"(?!\/@)(\/.+)\";/g, `import "/@fs${config.root}$1";`);
      }
    },
  };
}

export default createFixImportAnalysisPlugin;