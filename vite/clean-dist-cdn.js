import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert the import.meta.url to a file path properly for Windows
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dirPath = path.resolve(__dirname, '../dist/cdn');
const fileToKeep = 'night-vision.min.js';

export default function cleanDist() {
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath).forEach(file => {
    if (file !== fileToKeep) {
      fs.unlinkSync(path.join(dirPath, file));
    }
  });
}
