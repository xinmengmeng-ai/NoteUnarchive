'use strict';

const fs = require('fs');
const path = require('path');
const nodeAbi = require('node-abi');
const packageJson = require('../package.json');

function electronVersion() {
  const raw = packageJson.devDependencies?.electron || packageJson.dependencies?.electron || '';
  return raw.replace(/^[^\d]*/, '');
}

function copyBetterSqlitePrebuild(appOutDir) {
  const abi = nodeAbi.getAbi(electronVersion(), 'electron');
  const moduleDir = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3'
  );
  const source = path.join(moduleDir, 'bin', `win32-x64-${abi}`, 'better-sqlite3.node');
  const target = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

  if (fs.existsSync(target)) {
    return;
  }

  if (!fs.existsSync(source)) {
    throw new Error(`Missing Electron ABI ${abi} better-sqlite3 prebuild: ${source}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32' || context.arch !== 1) return;
  copyBetterSqlitePrebuild(context.appOutDir);
};
