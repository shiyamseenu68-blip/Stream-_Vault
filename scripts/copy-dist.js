const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'artifacts', 'streamvault', 'dist');
const targetDir = path.join(__dirname, '..', 'dist');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(sourceDir)) {
  copyDir(sourceDir, targetDir);
  console.log('Copied dist directory successfully');
} else {
  console.error('Source dist directory not found:', sourceDir);
  process.exit(1);
}
