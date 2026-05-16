#!/usr/bin/env node
// Launcher: unset ELECTRON_RUN_AS_NODE then spawn electron
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const electronBin = require('electron');
const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
