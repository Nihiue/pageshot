const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const chromium = require('chrome-aws-lambda');

process.env.FUNCTIONS_EMULATOR = 'true';

function sleep(dur = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, dur);
  });
}

async function downloadFonts() {
  if (fontsDownloaded) {
    return;
  }
  await Promise.all([
   chromium.font(path.join(__dirname, 'fonts/PingFang_Regular.ttf')),
   chromium.font(path.join(__dirname, 'fonts/PingFang_Bold.ttf')),
   chromium.font(path.join(__dirname, 'fonts/SF-Pro-Display-Bold.otf')),
   chromium.font(path.join(__dirname, 'fonts/SF-Pro-Display-Regular.otf'))
  ]);
  fontsDownloaded = true;
}

function getHash(str) {
  const hash = crypto.createHash('sha1');
  hash.update(str);
  return hash.digest('hex');
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    console.log('unlink faild');
  }
}

let fontsDownloaded = false;

exports.handler = async (event, context, callback) => {

  let browser = null;

  const resp = {
      'isBase64Encoded': true,
      'statusCode': 200,
      'headers': {
          'X-From-Service': 'PageshotExporter',
          'Content-Type': 'image/jpeg'
      },
      'body': ''
  };

  try {
    
    if (typeof event === 'string') {
      event = JSON.parse(event);
    }
    const query = event.queryParameters || event.queryStringParameters;
    
    const option = {
      width: parseInt(query.width || 1920, 10),
      height: parseInt(query.height || 1080, 10),
      dpr: parseInt(query.dpr || 2, 10),
      isMobile: Boolean(query.mobile)
    };

    if (!query.url) {
      throw new Error('invalid params');
    }

    await downloadFonts();

    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: option.width,
        height: option.height,
        deviceScaleFactor: option.dpr,
        isMobile: option.isMobile
      },
    });

    const page = await browser.newPage();
    const outputName = path.join('/tmp', `${getHash(query.url)}.jpg`);

    await page.goto(query.url, {
      waitUntil: 'networkidle0'
    });

    await page.addStyleTag({
      content: 'body { font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue",  "Microsoft YaHei", sans-serif; }'
    });

    await sleep(300);

    await page.screenshot({
      path: outputName,
      type: 'jpeg',
      quality: 90,
      fullPage: true
    });

    resp.body = fs.readFileSync(outputName, null).toString('base64');

    await removeFile(outputName);
    await browser.close();

    callback(null, resp);

  } catch (e) {

    resp.isBase64Encoded = false;
    resp.headers['Content-Type'] = 'text/plain';
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