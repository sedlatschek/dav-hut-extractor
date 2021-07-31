import { outputJson } from 'fs-extra';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { AGENT_LOCALE } from './config';
import Hut from './hut';
import { sleep } from './util';

(async () => {
  const browser = await puppeteer.launch({
    devtools: true,
    headless: false,
    args: [`--lang=${AGENT_LOCALE}`],
  });

  const huts = [];
  try {
    const start = moment();
    for (let i = 2; i < process.argv.length; i += 1) {
      const id = parseInt(process.argv[i]);
      console.log(`Hut ${id}`);
      const hut = new Hut(id);
      huts.push(hut);
      try {
        await hut.init(browser);
        const hutExists = await hut.navigate();
        await hut.retrieveInfo();
        if (hutExists) {
          await hut.retrieveWeeks(18);
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
