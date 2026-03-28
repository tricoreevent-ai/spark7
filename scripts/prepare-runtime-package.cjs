const fs = require('fs');
const path = require('path');

const distRoot = path.join(process.cwd(), 'dist');
const runtimePackages = [
  {
    filePath: path.join(distRoot, 'package.json'),
    payload: {
      name: 'sarva-runtime',
      private: true,
      type: 'commonjs',
      main: 'app.js',
      scripts: {
        start: 'node app.js',
      },
      engines: {
        node: '22.x',
      },
    },
  },
  {
    filePath: path.join(distRoot, 'desktop', 'package.json'),
    payload: {
      type: 'commonjs',
    },
  },
  {
    filePath: path.join(distRoot, 'server', 'package.json'),
    payload: {
      private: true,
      type: 'commonjs',
      main: 'app.js',
      scripts: {
        start: 'node app.js',
      },
      engines: {
        node: '22.x',
      },
    },
  },
];

const runtimeBootstrapPath = path.join(distRoot, 'app.js');
const runtimeBootstrap = `'use strict';\nrequire('./server/app.js');\n`;

for (const { filePath, payload } of runtimePackages) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Prepared ${path.relative(process.cwd(), filePath)}`);
}

fs.mkdirSync(path.dirname(runtimeBootstrapPath), { recursive: true });
fs.writeFileSync(runtimeBootstrapPath, runtimeBootstrap);
console.log(`Prepared ${path.relative(process.cwd(), runtimeBootstrapPath)}`);
