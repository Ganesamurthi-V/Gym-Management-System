const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withNativeWind} = require('nativewind/metro');
const path = require('path');

// @rn-primitives/portal keeps its portal registry in a module-level store. Its exports map hands
// ESM importers dist/index.mjs and CJS requirers dist/index.js, so App.tsx's <PortalHost /> and the
// dialog primitives ended up with two separate stores: dialogs registered into one, the host read
// the other, and every confirm/dialog silently never appeared (logout did nothing). Pin one build.
const PORTAL_ENTRY = path.resolve(__dirname, 'node_modules/@rn-primitives/portal/dist/index.js');

const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) =>
      moduleName === '@rn-primitives/portal'
        ? {type: 'sourceFile', filePath: PORTAL_ENTRY}
        : context.resolveRequest(context, moduleName, platform),
    blockList: [
      // Ignore temporary Android C++ build files that cause Metro watcher crashes
      /.*\/android\/\.cxx\/.*/,
      /.*\/android\/build\/.*/,
      /.*\/CMakeFiles\/.*/
    ],
  },
};

// inlineRem: 16 matches the web rem so shadcn spacing/radius render the same size.
module.exports = withNativeWind(mergeConfig(getDefaultConfig(__dirname), config), {
  input: './global.css',
  inlineRem: 16,
});
