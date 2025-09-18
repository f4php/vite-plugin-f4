const isPlainObject = (v) =>
  Object.prototype.toString.call(v) === '[object Object]';

const deepMerge = (target, source, options = { array: 'replace' }) => {
  const { array } = options;

  // Only merge when both are plain objects
  if (isPlainObject(target) && isPlainObject(source)) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sv = source[key];
      if (sv === undefined) continue;              // skip undefined overrides
      const tv = target[key];
      if (isPlainObject(tv) && isPlainObject(sv)) {
        result[key] = deepMerge(tv, sv, options);  // recurse objects
      } else if (Array.isArray(tv) && Array.isArray(sv)) {
        result[key] = array === 'concat' ? [...tv, ...sv] : [...sv]; // array strategy
      } else {
        // primitives, functions, dates, arrays vs objects, or differing types -> replace
        result[key] = sv;
      }
    }
    return result;
  }
  // If source is a plain object but target isn't, or vice-versa, source wins
  if (source !== undefined) return isPlainObject(source) ? { ...source } : source;
  return isPlainObject(target) ? { ...target } : target;
}

const createConfigPlugin = ({ outDir, base }) => {
  const defaultOptions = {
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
  };
  return {
    name: 'vite-plugin-f4-config',
    config(config) {
      return deepMerge(
        defaultOptions,
        config,
        { array: 'replace' }
      );
    }
  };
}

export default createConfigPlugin;