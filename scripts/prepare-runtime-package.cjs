const fs = require('fs');
const path = require('path');

const runtimePackagePaths = [
  path.join(process.cwd(), 'dist', 'package.json'),
  path.join(process.cwd(), 'dist', 'desktop', 'package.json'),
  path.join(process.cwd(), 'dist', 'server', 'package.json'),
];

for (const filePath of runtimePackagePaths) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ type: 'commonjs' }));
  console.log(`Prepared ${path.relative(process.cwd(), filePath)}`);
}
