const addFinalPluginPlugin = ({plugin, options}) => {
  return {
    name: 'vite-plugin-f4-append-final-plugin',
    configResolved(config) {
      config.plugins.push(plugin(options, config));
    },
  };
}

export default addFinalPluginPlugin;