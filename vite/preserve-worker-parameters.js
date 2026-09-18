export default function preserveWorkerParameters() {
  return {
    name: "preserve-worker-parameters",
    configResolved(config) {
      // ScriptStd inspects function parameter names to inject _id and _tf.
      config.esbuild = {
        ...config.esbuild,
        minifyIdentifiers: false,
        minifySyntax: true,
        minifyWhitespace: true,
      };
    },
  };
}
