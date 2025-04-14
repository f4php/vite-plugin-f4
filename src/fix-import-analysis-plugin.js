function createFixImportAnalysisPlugin(options, config) {
  return {
    name: 'vite-plugin-f4-fix-import-analysis',
    handleHotUpdate({ type, file, server }) {
      if(type === 'update' && file.startsWith(config.root)) {
        const targetModule = server.moduleGraph.getModuleById(file);
        if(targetModule) {
          targetModule.url = `/@fs${file}`;
        }
      }
    },
    transform(code, id) {
      if(id.startsWith(options.prefix)) {
        if (options.debug) {
          console.log(`Fix-transforming ${id} using method 1`);
        }
        return code.replace(/import\s+\"(?!\/@)(\/.+)\";/g, `import "/@fs${config.root}$1";`);
      }
      else if(id.match(options.stylesheetFilenameRegexp)) {
        return code.replace(/url\((?<quote>(\\[\"\'])?)(?<path>.+?)\k<quote>\)/g, function(match, p1, p2, p3, offset, string, groups) {
          if(groups.path.match(options.inlineAssetsUrlRegexp)) {
            if(!groups.path.startsWith(config.root)) {
              if (options.debug) {
                console.log(`Fix-transforming ${id} using method 2`);
              }
              return `url('/@fs/${config.root}${groups.path}')`;
            };
          }
          return match;
        });
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