const { withAppBuildGradle } = require("expo/config-plugins");
// Windows Ninja cannot handle long object paths in the generated default folder.
module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    const marker = "// NEU RUN: short CMake staging path";
    if (!mod.modResults.contents.includes(marker))
      mod.modResults.contents += `
${marker}
android { externalNativeBuild { cmake { buildStagingDirectory file("$rootDir/../.cxx") } } }
`;
    return mod;
  });
