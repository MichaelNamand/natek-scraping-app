const puppeteer = require('puppeteer');
const express = require('express');

const app = express();
const port = 3000;

app.get('/scrape', (req, res) => {
    getData().then(() => {
        res.send('Finished! Check your downloads folder, you should find two files named \'products.csv\' and \'categories.csv\'');
    });
});

app.listen(port, () => {
    console.log(`listening at http://localhost:${port}. Call the route : localhost:3000/scrape`);
});

const getData = async () => {
    let browser = await puppeteer.launch({
        headless: false,
        args: ["--disable-setuid-sandbox"],
        'ignoreHTTPSErrors': true
    });
    const page = await browser.newPage();
    await page.goto('https://demo-shop.natek.eu');

    // Array containing all the products with its details
    const results = [];
    console.log('Scraping in progress. Please wait...');

    // Wait for the required DOM to be rendered
    await page.waitForSelector('#main');

    // Scrap hierarchy categories section
    const hierarchyCategories = await page.evaluate(() => {
        const hierarchyCategories = [];
        const ul = document.querySelector('#woocommerce_product_categories-2 .product-categories');
        /**
         * Browse the categories list. If a category is a parent, then a recursive call is made to browse its childs
         * @param ul: current ul DOM node
         * @param parent: parent's name
         */
        let browseCategories = (ul, parent) => {
            for (let list of ul.getElementsByTagName('li')) {
                const category = {
                    name: list.querySelector('a').innerText,
                    link: list.querySelector('a').href
                };
                if (list.classList.contains('cat-parent')) {
                    browseCategories(list.querySelector('ul'), list.querySelector('a').innerText);
                } else if (parent) {
                    category['parent'] = parent;
                }
                hierarchyCategories.push(category);
            }
        };
        browseCategories(ul);
        return hierarchyCategories;
    });
    // Scrap the products of the current page
    return await scrapeCurrentPage();

    /**
     * Scrap the current page of the web shop depending of the pagination.
     * @returns {Promise<[]|*>}
     */
    async function scrapeCurrentPage() {
        // Wait for the required DOM to be rendered
        await page.waitForSelector('main ul > li');
        // Get all the product links from the current page
        let productLinks = await page.$$eval('main ul > li > .woocommerce-loop-product__link', links => {
            links = links.map(li => li.href);
            return links;
        });
        /**
         * Scrap the current product page in order to fill the required data in the csv file
         * @param link: the url of the current product to scrap
         * @returns {Promise<>}
         */
        let getProductDetailsFromProductPage = (link) => new Promise(async (resolve) => {

            let productPage = await browser.newPage();
            await productPage.goto(link);
            await productPage.waitForSelector('#main');

            // Filling the data from the page article
            const productDetails = await productPage.evaluate(() => {
                // Product ID
                let id = parseInt(document.querySelector('#main > .product').id.match(/\d+/)[0]);
                // Product name / title
                let title = document.querySelector('.product_title').innerText;
                // Product image URL
                let productImageUrl = document.querySelector('.woocommerce-product-gallery__image').getAttribute('data-thumb');
                // Product SKU
                let SKU = document.querySelector('.sku').innerText;
                // Product category
                let productCategory = document.querySelector('.posted_in a').innerText;
                // Product description
                let description = document.querySelector('#tab-description p').innerText;
                // Product color options
                let colorOption = [];
                let attributeColorItem = document.querySelector('#pa_color');
                if (attributeColorItem) {
                    const options = attributeColorItem.querySelectorAll('option');
                    for (let option of options) {
                        colorOption.push(option.innerText);
                    }
                    colorOption.shift();
                }
                // Product size options
                let sizeOption = [];
                let attributeSizeItem = document.querySelector('#pa_size');
                if (attributeSizeItem) {
                    const options = attributeSizeItem.querySelectorAll('option');
                    for (let option of options) {
                        sizeOption.push(option.innerText);
                    }
                    sizeOption.shift();
                }
                // Product price
                let price = document.querySelector('bdi').innerText;
                // Product attributes
                let attributesItem = document.querySelectorAll('#tab-additional_information');
                const attributes = [];
                if (attributesItem) {
                    for (let attributeRow of attributesItem) {
                        let columnTitle = attributeRow.querySelector('.woocommerce-product-attributes-item__label').innerText;
                        let columnData = attributeRow.querySelector('.woocommerce-product-attributes-item__value').innerText;
                        attributes.push(columnTitle + ':' + columnData);
                    }
                }
                // Related products SKUs
                const relatedProductsIds = [];
                let relatedProductsList = document.querySelectorAll('section.related ul > li.product');
                // Saving the id of each product in order to find later its SKU
                for (let p of relatedProductsList) {
                    for (let className of p.classList) {
                        if (className.includes('post-')) {
                            relatedProductsIds.push(parseInt(className.match(/\d+/)[0]));
                            break;
                        }
                    }
                }
                return {
                    id, title, productImageUrl, SKU, productCategory, description, colorOption, sizeOption,
                    attributes, price, relatedProductsIds
                }
            });
            resolve(productDetails);
            await productPage.close();
        });
        // For every link of products found in current page, we get into it to retrieve its details
        for (let link of productLinks) {
            results.push(await getProductDetailsFromProductPage(link));
        }

        // Check if there is still pagination
        let nextButtonExist;
        try {
            await page.$eval('.page-numbers .next', a => a.textContent);
            nextButtonExist = true;
        } catch (err) {
        }
        // If another page exists, click on it and do all the scraping stuff again
        if (nextButtonExist) {
            await page.click('.page-numbers .next');
            return scrapeCurrentPage(); // Call this function recursively
        }
        // Here, we have all the products with its details except related products' SKU. So thanks to products id,
        // we just have to browse the relatedProductsIds array and the results array in order to find back their SKU.
        for (let product of results) {
            const relatedProductsSKUs = [];
            if (product.relatedProductsIds) {
                for (let id of product.relatedProductsIds) {
                    for (let product2 of results) {
                        if (id === product2.id) {
                            relatedProductsSKUs.push(product2.SKU);
                            break;
                        }
                    }
                }
                product['relatedProductsSKUs'] = relatedProductsSKUs;
            }
            // We don't need those data anymore in the CSV file
            delete product.relatedProductsIds;
            delete product.id;
        }
        // To generate the CSV file, we get into the current page in order to convert the results array to CSV and then
        // generate the file and download it
        const arrays = [results, hierarchyCategories];
        await page.evaluate((arrays) => {
            function download(filename, objArray) {
                const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
                let str = `${Object.keys(array[0]).map(value => `"${value}"`).join(",")}` + '\r\n';

                const text = array.reduce((str, next) => {
                    str += `${Object.values(next).map(value => `"${value}"`).join(",")}` + '\r\n';
                    return str;
                }, str);
                const element = document.createElement('a');
                element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
                element.setAttribute('download', filename);

                element.style.display = 'none';
                document.body.appendChild(element);

                element.click();

                document.body.removeChild(element);
            }

            download('products.csv', arrays[0]);
            download('categories.csv', arrays[1]);
        }, arrays);
    }
}

