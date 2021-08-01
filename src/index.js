import { ensureDir, outputJson } from 'fs-extra';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { DIR_API, DIR_API_HUTS, HUT_MAX_INDEX, LOCALES } from './config';
import Hut from './hut';

const dev = process.env.NODE_ENV === 'development';

const ids = process.argv.length > 2
  ? process.argv.slice(2).map(arg => parseInt(arg)).filter(arg => !!arg)
  : Array.from({ length: HUT_MAX_INDEX }, (_, i) => i + 1);

(async () => {
  let success = true;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    devtools: dev,
    executablePath: process.env.PUPPETEER_EXEC_PATH,
    headless: false,
  });

  const huts = [];

  try {
    await ensureDir(DIR_API_HUTS);

    const start = moment();
    for (let i = 0; i < ids.length; i += 1) {
      const id = parseInt(ids[i]);
      console.log(`\nHut ${id}`);
      const hut = new Hut(id);
      huts.push(hut);
      try {
        console.log('> Init');
        await hut.init(browser);
        for (let i = 0; i < LOCALES.length; i += 1) {
          const locale = LOCALES[i];

          console.log(`> Navigate (${locale})`);
          await hut.navigate(locale);

          console.log(`> Retrieve info (${locale})`);
          await hut.retrieveInfo(locale);

          if (hut.active) {
            console.log(`> Retrieve bed categories (${locale})`);
            await hut.retrieveBedCategories(locale);
          }
        }
        if (hut.active) {
          console.log(`Name: ${hut.name}`);
          console.log('> Download image');
          await hut.downloadImage(`${DIR_API_HUTS}${id}.png`);
          await hut.retrieveWeeks(18);
        } else {
          console.log(`Error: ${JSON.stringify(hut.error, null, 2)}`);
        }
      } finally {
        console.log('> Close');
        await hut.close();
      }
      console.log('> Serialize');
      await hut.serialize(`${DIR_API_HUTS}${id}.json`);

      // save huts every time to not lose data in case of an error
      console.log('Save huts');
      await outputJson(`${DIR_API_HUTS}index.json`, {
        ts: new Date(),
        huts: huts.map(hut => {
          if (hut.name) {
            return {
              id: hut.id,
              name: hut.name,
              active: hut.active,
            };
          }
        })
        .filter(hut => !!hut)
        .sort((a, b) => a.id - b.id),
      });

      // save bed categories
      console.log('Save bed categories');
      const bedCategories = {};
      LOCALES.forEach((locale) => {
        bedCategories[locale] = [];
        huts.forEach((hut) => {
          hut.bedCategories[locale].forEach((cat) => {
            if (bedCategories[locale].findIndex((b) => b.id === cat.id) === -1) {
              bedCategories[locale].push(cat);
            }
          });
        });
        bedCategories[locale].sort((a, b) => a.id - b.id);
      })
      await outputJson(`${DIR_API}bedcategories.json`, {
        ts: new Date(),
        bedCategories: bedCategories,
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
