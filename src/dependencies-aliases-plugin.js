import path from 'path';

const createDependenciesAliasesPlugin = ({ dependencies, debug }) => {

  const reducedDependencies = dependencies
  .reduce((aliases, module) => {
      aliases[module] = path.resolve(`./node_modules/${module}`);
      return aliases;
  }, {});
  if (debug) {
    console.debug(`Creeated dependencies aliases:`, reducedDependencies)
  }
  return {
    name: 'vite-plugin-f4-dependencies-aliases',
    config() {
      return {
        resolve: {
          alias: {
            ...reducedDependencies
          }
        }
      }
    }
  };
}

export default createDependenciesAliasesPlugin;