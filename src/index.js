import { outputJson } from 'fs-extra';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { AGENT_LOCALE, HUT_MAX_INDEX } from './config';
import Hut from './hut';

const dev = process.env.NODE_ENV === 'development';

const ids = process.argv.length > 2
  ? process.argv.slice(2)
  : Array.from({ length: HUT_MAX_INDEX }, (_, i) => i + 1);

(async () => {
  let success = true;

  const browser = await puppeteer.launch({
    args: [
      `--lang=${AGENT_LOCALE}`,
      '--no-sandbox',
    ],
    devtools: dev,
    executablePath: process.env.PUPPETEER_EXEC_PATH,
    headless: false,
  });

  const huts = [];
  try {
    const start = moment();
    for (let i = 0; i < ids.length; i += 1) {
      const id = parseInt(ids[i]);
      console.log(`\nHut ${id}`);
      const hut = new Hut(id);
      huts.push(hut);
      try {
        console.log('> Init');
        await hut.init(browser);
        console.log('> Navigate');
        const hutExists = await hut.navigate();
        console.log('> Retrieve info');
        await hut.retrieveInfo();
        if (hutExists) {
          console.log(`    Name: ${hut.name}`);
          await hut.retrieveWeeks(18);
        } else {
          console.log(`    Error: ${hut.error}`);
        }
      } finally {
        console.log('> Close');
        await hut.close();
      }
      console.log('> Serialize');
      await hut.serialize(`./data/${id}.json`);

      // save huts every time to not lose data in case of an error
      console.log('Save');
      outputJson('./data/huts.json', {
        ts: new Date(),
        huts: huts.map(hut => {
          return {
            id: hut.id,
            name: hut.name,
          };
        }),
      });
    }

    const duration = moment.duration(moment().diff(start));
    console.log(`\nFinished in ${duration.asMinutes().toFixed(1)} minutes.`);
  } catch(error) {
    console.error(error);
    success = false;
  } finally {
    // close all leftover pages
    const pages = await browser.pages();
    await Promise.all(pages.map(page => page.close()));
    // close browser
    await browser.close();
    process.exit(success ? 0 : 1);
  }
})();
