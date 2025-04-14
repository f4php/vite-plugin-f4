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
      const root = `/${config.root.replace(/^\/+|\/+$/g, '')}`;
      if(id.startsWith(options.prefix)) {
        return code.replace(/import\s+(?<quote>([\"\'])?)(?!\/@)(?<path>\/\S+)\k<quote>/g, function(match, p1, p2, p3, offset, string, groups) {
          return `import "/@fs${root}${groups.path}"`;
        });
      }
      else if(id.replace(root, '').match(options.transformPathRegexp)) {
        return code.replace(/import\s+(?<from>(\S+\s+from\s+))?(?<quote>([\"\'])?)(?<path>\S+?)\k<quote>/g, function(match, p1, p2, p3, p4, p5, offset, string, groups) {
          if(groups.path.match(options.transformPathRegexp)) {
            return `import ${groups.from}'/@fs${root}${groups.path}';`;
          }
          return match;
        });
      }
      else if(id.match(options.stylesheetFilenameRegexp)) {
        return code.replace(/url\((?<quote>([\"\'])?)(?<path>\S+?)\k<quote>\)/g, function(match, p1, p2, p3, offset, string, groups) {
          if(groups.path.match(options.inlineAssetsUrlRegexp)) {
            if(!groups.path.startsWith(root)) {
              return `url('/@fs/${root}${groups.path}')`;
            };
          }
          return match;
        });
      }
      else if (id.startsWith(root) && !id.startsWith(`${root}/node_modules`)) {
        const relativePath = id.slice(root.length);
        const regexp = new RegExp(`__vite__createHotContext\\("${relativePath}"\\)`, "g");
        const replacement = `__vite__createHotContext("/@fs${id}")`;
        return code.replace(regexp, replacement)
      }
    },
  };
}

export default createFixImportAnalysisPlugin;