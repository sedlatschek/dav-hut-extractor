import { readJson } from "fs-extra";
import { FILE_STATS } from './config';

(async () => {
  const stats = await readJson(FILE_STATS);
  if (stats.errors.length > 0) {
    throw new Error('There where issues with this scrape.\n' + stats.errors.join('\n'));
  } else {
    console.log('Everything is fine, exiting...');
  }
})();
