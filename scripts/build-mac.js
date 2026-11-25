// Builds "Thumbnail Studio.app" from the code in this folder.
//
// Normally you don't run this yourself: "Install Thumbnail Studio.command"
// runs it for you. The finished app lands in dist/.
//
//   node scripts/build-mac.js            build for this Mac's chip
//   node scripts/build-mac.js x64        build for Intel Macs
//   node scripts/build-mac.js arm64      build for Apple silicon (M1, M2, …)

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const arch = process.argv[2] || (process.platform === 'darwin' ? process.arch : 'arm64');

async function main() {
  const { packager } = await import('@electron/packager');
  const [outDir] = await packager({
    dir: ROOT,
    name: 'Thumbnail Studio',
    platform: 'darwin',
    arch,
    out: path.join(ROOT, 'dist'),
    overwrite: true,
    asar: true, // pack the code into one file inside the app
    appBundleId: 'local.thumbnail-studio',
    appCategoryType: 'public.app-category.graphics-design',
    // Leave out everything the app doesn't need to run.
    ignore: [/^\/(dist|tests|docs|scripts|user-data)(\/|$)/, /\.command$/, /^\/\.git/, /\.DS_Store$/],
  });
  const appPath = path.join(outDir, 'Thumbnail Studio.app');

  // macOS only runs apps that carry a signature. This gives the app a
  // simple "made on this Mac" signature using Apple's own codesign tool.
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  }
  console.log(`Built: ${appPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
