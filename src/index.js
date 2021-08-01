import { outputJson } from 'fs-extra';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { HUT_MAX_INDEX, LOCALES } from './config';
import Hut from './hut';

const dev = process.env.NODE_ENV === 'development';

const ids = process.argv.length > 2
  ? process.argv.slice(2)
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
    const start = moment();
    for (let i = 0; i < ids.length; i += 1) {
      const id = parseInt(ids[i]);
      console.log(`\nHut ${id}`);
      const hut = new Hut(id);
      huts.push(hut);
      try {
        console.log('> Init');
        await hut.init(browser);
        let hutExists = false;
        for (let i = 0; i < LOCALES.length; i += 1) {
          const locale = LOCALES[i];
          console.log(`> Navigate (${locale})`);
          hutExists = await hut.navigate(locale);
          console.log(`> Retrieve info (${locale})`);
          await hut.retrieveInfo(locale);
          if (hutExists) {
            console.log(`> Retrieve bed categories (${locale})`);
            await hut.retrieveBedCategories(locale);
          }
        }
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
      await hut.serialize(`./api/huts/${id}.json`);

      // save huts every time to not lose data in case of an error
      console.log('Save huts');
      await outputJson('./api/huts/index.json', {
        ts: new Date(),
        huts: huts.map(hut => {
          if (hut.name) {
            return {
              id: hut.id,
              name: hut.name,
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
      await outputJson('./api/bedcategories.json', {
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
