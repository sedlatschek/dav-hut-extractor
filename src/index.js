import { exists, outputJson } from 'fs-extra';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { AGENT_LOCALE } from './config';
import Hut from './hut';
import { sleep } from './util';

const dev = process.env.NODE_ENV === 'development';

const ids = process.argv.length > 2
  ? process.argv.slice(2)
  : Array.from({ length: 400 }, (_, i) => i + 1);

(async () => {
  const browser = await puppeteer.launch({
    devtools: dev,
    headless: !dev,
    args: [
      `--lang=${AGENT_LOCALE}`,
      '--no-sandbox',
    ],
  });

  const huts = [];
  try {
    const start = moment();
    for (let i = 0; i < ids.length; i += 1) {
      const id = parseInt(ids[i]);
      console.log(`Hut ${id}`);
      const hut = new Hut(id);
      huts.push(hut);
      try {
        await hut.init(browser);
        const hutExists = await hut.navigate();
        await hut.retrieveInfo();
        if (hutExists) {
          console.log(`> Name: ${hut.name}`);
          await hut.retrieveWeeks(18);
        } else {
          console.log(`> Error: ${hut.error}`);
        }
      } finally {
        await hut.close();
      }
      await hut.serialize(`./data/${id}.json`);
      sleep(1000);

      outputJson('./data/huts.json', {
        ts: new Date(),
        huts: huts.map(hut => {
          const tmp = {};
          tmp[hut.id] = hut.name;
          return tmp;
        }),
      });
    }

    const duration = moment.duration(moment().diff(start));
    console.log(`Finished in ${duration.asMinutes().toFixed(1)} minutes.`);
  } finally {
    await browser.close();
  }
})();
