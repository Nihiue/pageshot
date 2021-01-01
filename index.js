const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const chromium = require('chrome-aws-lambda');

let fontsDownloaded = false;

function sleep(dur = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, dur);
  });
}

async function downloadFonts() {
  if (fontsDownloaded) {
    return;
  }
  const ret = await Promise.all([
   chromium.font('https://kesci-fe-assets.s3.cn-north-1.amazonaws.com.cn/fonts/wqy-microhei.ttc')
  ]);
  console.log(ret);
  fontsDownloaded = true;
}

function getHash(str) {
  const hash = crypto.createHash('sha1');
  hash.update(str);
  return hash.digest('hex');
}

async function uploadToS3(fileName, filePath) {
  await s3.putObject({
    Bucket: 'kesci-fe-assets',
    Body: fs.createReadStream(filePath),
    Key: `pageshot/${fileName}`,
    ContentType: 'image/jpeg'
  }).promise();
}

async function s3FileExist(fileName) {
  try {
    await s3.headObject({
      Bucket: 'kesci-fe-assets',
      Key: `pageshot/${fileName}`
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

exports.handler = async (event, context, callback) => {

  let browser = null;
  const resp = {
      'isBase64Encoded': false,
      'statusCode': 200,
      'headers': {
          'X-From-Service': 'PageshotExporter',
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
    resp.body = `https://kesci-fe-assets.s3.cn-north-1.amazonaws.com.cn/pageshot/${outputName}`;

    const exists = await s3FileExist(outputName);
    if (exists) {
      return callback(null, resp);
    }

    await downloadFonts();

    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 540,
        height: 960,
        deviceScaleFactor: 2,
        isMobile: true
      },
    });
    const page = await browser.newPage();

    await page.goto(query.url, {
      waitUntil: 'networkidle0'
    });

    await page.addStyleTag({
      content: 'body { font-family: "Wen Quan Yi Micro Hei", sans-serif !important;}'
    });

    await sleep(300);

    await page.screenshot({
      path: path.join('/tmp', outputName),
      type: 'jpeg',
      quality: 90,
      fullPage: true
    });

    await browser.close();

    await uploadToS3(outputName, path.join('/tmp', outputName));
    await removeFile(path.join('/tmp', outputName));

    callback(null, resp);
  } catch (e) {
    console.log(e);
    resp.body = e && e.toString();
    resp.statusCode = 400;
    callback(null, resp);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};

// exports.handler({
//   queryParameters: {
//     url: 'https://www.kesci.com/api/notebooks/5fec3c12840381003bfd8076/RenderedContent',
//     code: '79305'
//   }
// }, null, (e, resp) => {
//   console.log(resp);
// })