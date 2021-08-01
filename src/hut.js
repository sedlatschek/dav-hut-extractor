
import { outputJson, writeFile } from 'fs-extra';
import moment from 'moment';
import { ALPSONLINE_URL, LOCALES } from './config';

async function text(page, selector) {
  const element = await page.$(selector);
  if (!element) return null;
  return await element.evaluate(el => el.textContent);
}

async function hidden(page, selector) {
  const element = await page.$(selector);
  return !element || await element.evaluate(el => window.getComputedStyle(el).getPropertyValue('display') === 'none');
}

const request = async (
  page,
  url,
  method = 'GET',
  options = { body: undefined, headers: undefined },
 ) => {
 return await page.evaluate(
   datas => {
     return fetch(datas.url, {
       method: datas.method,
       body: datas.options.body,
       headers: datas.options.headers,
     })
       .then(response => response.json().then(r => r))
       .catch(err => {
          console.error(err);
       });
   },
   { url, method, options },
  );
};

export default class Hut {
  constructor(id) {
    this.id = id;
    this.name = null;
    this.info = LOCALES.reduce((o, i) => { o[i] = []; return o; }, {});
    this.desc = LOCALES.reduce((o, i) => { o[i] = null; return o; }, {});
    this.bedCategories = Object.assign({}, this.info);
    this.calendar = {};
    this.error = Object.assign({}, this.desc);
  }
  async init(browser) {
    this.page = await browser.newPage();
  }
  async navigate(locale = 'de_AT') {
    await this.page.goto(`${ALPSONLINE_URL}calendar?hut_id=${this.id}&lang=${locale}`);
    await this.page.waitForSelector('body.loading', { hidden: true });
    if (!await hidden(this.page, '#glb-error')) {
      this.error[locale] = await text(this.page, '#glb-error .errorsMessage');
      return false;
    }
    return true;
  }
  async retrieveInfo(locale = 'de_AT') {
    this.name = await text(this.page, '.info > h4');
    this.info[locale] = await this.page.$$eval(`.info > span`, lines => lines.map(line => line.innerText));
    const desc = (await text(this.page, '.mainInfo'));
    if (desc) {
      // sanitize description
      this.desc[locale] = desc
        .replace(/ +/g, ' ')
        .replace(/( \n|\n )/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .replace(/(^\n|\n$)/g, '');
    }
  }
  async retrieveBedCategories(locale = 'de_AT') {
    this.bedCategories[locale] = await this.page.$$eval('#roomInfo0 > div', categories => categories.map(cat => {
      return {
        id: parseInt(cat.id.replace('room0-', '')),
        name: cat.querySelector('.item-label').innerText,
      };
    }));
  }
  retrieveWeeks(n = 2) {
    const promises = [];
    for (let i = 0; i < n / 2; i += 1) {
      promises.push(this.retrieve(moment().add(i * 14, 'days')));
    }
    return Promise.all(promises);
  }
  async retrieve(from, to = null) {
    const fromStr = moment(from).format('DD.MM.YYYY');
    console.log(`> Retrieve reservations from ${fromStr}`);
    const days = await request(this.page, `${ALPSONLINE_URL}selectDate?date=${fromStr}`);
    Object.values(days).forEach((day) => {
      day.forEach((cat) => {
        const date = moment(cat.reservationDate, 'DD.MM.YYYY');
        if (date >= from && (!to || to >= date)) {
          const key = date.format('YYYY-MM-DD');
          if (this.calendar[key]) {
            this.calendar[key].push(cat);
          } else {
            this.calendar[key] = [cat];
          }
        }
      });
    });
  }
  async downloadImage(path) {
    const base64 = await this.page.$eval('.logo img', img => {
      if (!img) return null;
      img.style.setProperty('height', 'auto');
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataUri = canvas.toDataURL('image/png');
      return dataUri.replace(/^data:image\/(png|jpg);base64,/, '');
    });
    if (base64) {
      await writeFile(path, base64, 'base64');
    }
  }
  async close() {
    await this.page.close();
    delete this.page;
  }
  async serialize(path) {
    await outputJson(path, {
      ts: new Date(),
      huts: [this],
    });
  }
}

