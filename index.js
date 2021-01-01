const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const chromium = require('chrome-aws-lambda');

async function setFonts() {
  await chromium.font(path.join(__dirname, '../PingFang_Bold.ttf'));
  await chromium.font(path.join(__dirname, '../PingFang_Regular.ttf'));
  await chromium.font(path.join(__dirname, '../SF-Pro-Display-Bold.otf'));
  await chromium.font(path.join(__dirname, '../SF-Pro-Display-Regular.otf'));
}

function getHash(str) {
  return new Promise(resolve, reject => {
    const hash = crypto.createHash('sha256');
    hash.update(str);
    return hash.digest('hex');
  });
}

async function uploadToS3(fileName, filePath) {
  await s3.putObject({
    Bucket: 'kesci-fe-assets',
    Body: fs.readFileSync(filePath, { encoding: 'binary' }),
    Key: `2020image/${fileName}`
  }).promise();
}

async function s3FileExist(fileName) {
  try {
    await s3.headObject({
      Bucket: 'kesci-fe-assets',
      Key: `2020image/${fileName}`
    }).promise();
    return true;
  } catch (e) {
    return false;
  }
}
function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);

  } catch (e) {
    console.log('unlink faild');
  }
}

exports.handler = (async (event, context, callback) => {
  await setFonts();

  let browser = null;
  const resp = {
      'isBase64Encoded': false,
      'statusCode': 200,
      'headers': {
          'X-From-Service': 'SpaRendererChrome',
          'Content-Type': 'text/html; charset=utf-8'
      },
      'body': ''
  };

  if (typeof event === 'string') {
    event = JSON.parse(event);
  }
  const query = event.queryParameters || event.queryStringParameters;

  try {
    if (!query.url || query.code != '79305') {
      throw new Error('invalid params');
    }
    const outputName = `${getHash(query.url)}.jpg`;
    resp.body = outputName;

    const exists = await s3FileExist(outputName);
    if (exists) {
      return callback(null, resp);
    }

    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 540,
        height: 960,
        deviceScaleFactor: 2,
        isMobile: true
      },
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();

    await page.goto(query.url, {
      waitUntil: 'networkidle0'
    });

    await page.screenshot({
      path: path.join(__dirname, outputName),
      type: 'jpeg',
      quality: 90,
      fullPage: true
    });

    await browser.close();

    await uploadToS3(outputName, path.join(__dirname, outputName));
    await removeFile(path.join(__dirname, outputName));

    callback(null, resp);
  } catch (e) {
    resp.body = e && e.toString();
    resp.statusCode = 400;
    callback(null, resp);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }

})();