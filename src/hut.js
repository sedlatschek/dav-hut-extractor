
import { outputJson } from 'fs-extra';
import moment from 'moment';
import { ALPSONLINE_URL } from './config';

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
    this.info = null;
    this.calendar = {};
    this.error = null;
  }
  async init(browser) {
    this.page = await browser.newPage();
  }
  async navigate() {
    await this.page.goto(`${ALPSONLINE_URL}calendar?hut_id=${this.id}`);
    await this.page.waitForSelector('body.loading', { hidden: true });
    if (!await hidden(this.page, '#glb-error')) {
      this.error = await text(this.page, '#glb-error .errorsMessage');
      return false;
    }
    return true;
  }
  async retrieveInfo() {
    this.name = await text(this.page, '.info > h4');
    this.info = await this.page.$$eval(`.info > span`, lines => lines.map(line => line.innerText));
  }
  async retrieveWeeks(n = 2) {
    for (let i = 0; i < n / 2; i += 1) {
      await this.retrieve(moment().add(i * 14, 'days'));
    }
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

