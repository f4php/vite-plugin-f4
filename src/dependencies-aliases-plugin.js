import path from 'path';

const createDependenciesAliasesPlugin = ({ dependencies }) => {
  return {
    name: 'vite-plugin-f4-dependencies-aliases',
    config() {
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

export default createDependenciesAliasesPlugin;