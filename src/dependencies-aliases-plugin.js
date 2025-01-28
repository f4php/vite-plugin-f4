import path from 'path';

const createDependenciesAliasesPlugin = ({ dependencies }) => {
  return {
    name: 'vite-plugin-f4-module-aliases',
    config(config, { command }) {
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