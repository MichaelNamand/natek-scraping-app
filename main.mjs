import fs from "fs";

import * as puppeteer from 'puppeteer';
import cookies from './cookies.json' with {type: "json"};
import {convertFrenchDateToDDMMYYYY} from "./utils.js";

const cookiesToDelete = [
    "FCCDCF",
    "FCNEC",
    "PHPSESSID",
    "_ga",
    "_ga_965DXEW8TE",
    "ww",
    "www_passionxm_com_kptch",
    "www_passionxm_com_redirected_from_post_idn",
    "www_passionxm_com_sid",
    "{d612ea3d-d211-43c2-ac11-f25650dff498}"
];

const cookiesToAdd = [
    "PHPSESSID",
    "ww",
    "www_passionxm_com_kptch",
    "www_passionxm_com_redirected_from_post_idn",
    "name",
    "www_passionxm_com_sid",
    "www_passionxm_com_sid"
];

const getData = async () => {
    let browser = await puppeteer.launch({
        headless: false,
        args: ["--disable-setuid-sandbox"],
        'ignoreHTTPSErrors': true
    });
    const page = await browser.newPage();

    await page.goto('https://www.passionxm.com/login.php');

    try {
        await page.click('.fc-cta-consent')

        await page.waitForFunction(
            'window.performance.timing.loadEventEnd - window.performance.timing.navigationStart >= 500'
        );
    } catch (e) {
        console.log('captcha... Wait for resolve');

        await page.waitForSelector('[name="username"]');
    }


    for (const cookie of cookiesToDelete) {
        await page.deleteCookie({name: cookie, domain: '.passionxm.com'})
        await page.deleteCookie({name: cookie, domain: '.www.passionxm.com'})
        await page.deleteCookie({name: cookie, domain: 'www.passionxm.com'})
    }

     await page.setCookie(...cookies);

    // Wait for the required DOM to be rendered
    await page.waitForSelector('#mainheader');

    await page.reload()
    await page.reload()

    const data = [];

    // await getForums(data)
    const forums = await page.$('.largeLeft');

    if (!forums) {
        console.log('diconnected, reconnecting...');
        await login(page)
    } else {
        console.log('already logged in...');
    }
    await clickConsent(page);

    await getUsers(page, data)

    fs.writeFile("data.json", JSON.stringify(data), (err) => {})
}

const clickConsent = async (page) => {
    try {
        await page.click('.fc-cta-consent')
    } catch (err) {
        console.log('already consent clicked')
    }
}

const getUsers = async (page, data) => {
    await page.waitForSelector('#footer');

    const rci = new URL(await page.evaluate(() => {
        return document.querySelectorAll('#footer a')[1].href;
    })).searchParams.get('rci')

    await page.goto(`https://www.passionxm.com/admin/admin_userlist.php?rci=${rci}`)

    await page.waitForSelector('.gen');

    const getPage = async (data) => {
        console.log('getPage()');
        const lines = [];

        const elements = await page.$$('#contents > form:nth-child(8) > table > tbody > tr:nth-child(2) > td > dl');

        for (const el of elements) {
            const text = await page.evaluate(el => el.textContent, el);
            const hasLink = await page.evaluate(el => el.querySelector('a') !== null, el);

            if (text.includes('Permissions') && hasLink) {
                lines.push(el);
            }
        }
        for (const line of lines) {
            data.push({
                pseudo: await line?.evaluate(el => el.querySelector('b').textContent),
                email: await line?.evaluate(el => el.querySelectorAll('a')[1].href.replace('mailto:', '')),
                actif: await line?.evaluate(el => !!el.querySelector('.yes')),
                nombreMessages: parseInt(await line?.evaluate(el => el.querySelectorAll('dd')[2].textContent)),
                inscritLe: convertFrenchDateToDDMMYYYY(await line?.evaluate(el => el.querySelectorAll('dd')[4].textContent)),
                derniereVisite: convertFrenchDateToDDMMYYYY(await line?.evaluate(el => el.querySelectorAll('dd')[5].textContent)),
            })
        }
    }

    const links =  await (await page.$$('.gen'))[1].$$('a');

    const total = await page.evaluate(el => el.textContent, links[links.length - 2]);

    for (let i = 1; i <= parseInt(total); i++) {
        console.log(i)
        await getPage(data);
        fs.writeFile("data.json", JSON.stringify(data), async () => {})
        const gens = await page.$$('.gen');
        const secondGen = gens[1]; // Get the second '.gen'
        const next = await secondGen.$(':scope > *:last-child');

        try {
            await Promise.all([
                next.click(),
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
            ]);
        } catch (err) {
            console.log('Too long waiting for network idle, continuing...');
        }
    }
    console.log('finished...');
}

const getForums =async (data) => {
    const forums = await page.$('.largeLeft');
    const blocs = await forums.$$('.bloc');
    for (const bloc of blocs) {
        data.push({
            categorie: await bloc?.evaluate(el => el.querySelector('.cattitle').textContent),
            topics: await bloc?.evaluate(el => {
                return Array.from(el.querySelectorAll('.topictitle')).map(element => element.textContent)
            }),
        })
    }
}

const login = async (page) => {
    await clickConsent(page);

    await page.locator('[name="username"]').fill('aqueoui');
    await page.locator('[name="password"]').fill('567965');

    await page.click('[name="login"]');

    await page.waitForFunction(
        'window.performance.timing.loadEventEnd - window.performance.timing.navigationStart >= 500'
    );

    const cookies = await page.cookies();

    const cookiesToWrite = [];

    for (const cookie of cookies) {
        for (const labelledCookie of cookiesToAdd) {
            if (cookie.name === labelledCookie || decodeURI(cookie.name).includes('{')) {
                cookiesToWrite.push({
                    name: decodeURI(cookie.name),
                    value: decodeURI(cookie.value),
                    domain: cookie.domain,
                })
            }

        }
    }

    fs.writeFile("cookies.json", JSON.stringify(cookiesToWrite), (error) => {
        // throwing the error
        // in case of a writing problem
        if (error) {
            // logging the error
            console.error(error);

            throw error;
        }

        console.log("cookies saved correctly");
    });
}

getData();
