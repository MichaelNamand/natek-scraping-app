import fs from "fs";

import * as puppeteer from 'puppeteer';
import cookies from './cookies.json' assert {type: "json"};

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

    await page.click('.fc-cta-consent')

    await page.waitForFunction(
        'window.performance.timing.loadEventEnd - window.performance.timing.navigationStart >= 500'
    );

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

    const forums = await page.$('.largeLeft');

    const data = [];

    if (!forums) {
        console.log('diconnected, reconnecting...');
        await login(page)
    }
    await clickConsent(page);

    const blocs = await forums.$$('.bloc');

    for (const bloc of blocs) {
        data.push({
            categorie: await bloc?.evaluate(el => el.querySelector('.cattitle').textContent),
            topics: await bloc?.evaluate(el => {
                return Array.from(el.querySelectorAll('.topictitle')).map(element => element.textContent)
            }),
        })

    }
    console.log(data)
    fs.writeFile("data.json", JSON.stringify(data), (err) => {})
}

const clickConsent = async (page) => {
    try {
        await page.click('.fc-cta-consent')
    } catch (err) {
        console.log('already consent clicked')
    }
}

const login = async (page) => {
    await clickConsent(page);

    await page.locator('[name="username"]').fill('Michael.Nd');
    await page.locator('[name="password"]').fill('kollok95');

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

        console.log("data.json written correctly");
    });
}

getData();
