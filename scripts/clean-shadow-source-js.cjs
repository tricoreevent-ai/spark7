const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', 'src');
const sourceExtensions = ['.ts', '.tsx', '.mts'];
const removedFiles = [];

const hasSourceSibling = (filePath) => {
  const parsed = path.parse(filePath);
  const baseWithoutMap = parsed.base.endsWith('.js.map')
    ? parsed.base.slice(0, -'.js.map'.length)
    : parsed.base.slice(0, -'.js'.length);
  const stemPath = path.join(parsed.dir, baseWithoutMap);
  return sourceExtensions.some((extension) => fs.existsSync(`${stemPath}${extension}`));
};

const walk = (dirPath) => {
  if (!fs.existsSync(dirPath)) return;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walk(entryPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const isShadowArtifact = entry.name.endsWith('.js') || entry.name.endsWith('.js.map');
    if (!isShadowArtifact) continue;
    if (!hasSourceSibling(entryPath)) continue;

    fs.unlinkSync(entryPath);
    removedFiles.push(path.relative(path.resolve(__dirname, '..'), entryPath));
  }
};

walk(rootDir);

if (removedFiles.length > 0) {
  console.log(`Removed ${removedFiles.length} generated src shadow file(s).`);
}
