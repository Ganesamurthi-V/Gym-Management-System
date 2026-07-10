const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  resolver: {
    blockList: [
      // Ignore temporary Android C++ build files that cause Metro watcher crashes
      /.*\/android\/\.cxx\/.*/,
      /.*\/android\/build\/.*/,
      /.*\/CMakeFiles\/.*/
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
