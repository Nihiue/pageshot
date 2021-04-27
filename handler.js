process.env.FUNCTION_NAME = 'pageshot';
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_node12';

const path = require('path');
const chromium = require('chrome-aws-lambda');

const OPTIONS = {
  pc: {
    width: 1920,
    height: 1080,
    dpr: 2,
    isMobile: false,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36'
  },
  phone: {
    width: 428,
    height: 926,
    dpr: 3,
    isMobile: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.2 Mobile/15E148 Safari/604.1'
  },
  pad: {
    width: 1024,
    height: 1366,
    dpr: 2,
    isMobile: true,
    ua: 'Mozilla/5.0 (iPad; CPU iPhone OS 13_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.2 Mobile/15E148 Safari/604.1'
  }
};

let fontsDownloaded = false;

async function downloadFonts() {
  if (fontsDownloaded) {
    return;
  }
  const fonts = ['PingFang_Regular.ttf', 'PingFang_Bold.ttf', 'SF-Pro-Display-Bold.otf', 'SF-Pro-Display-Regular.otf'];
  await Promise.all(fonts.map((name) => {
    return chromium.font(path.join(__dirname, `fonts/${name}`));
  }));
  fontsDownloaded = true;
}

exports.handler = async (request, response, context) => {
  let browser = null;
  try {
    // const params = {
    //   path: request.path,
    //   query: request.query,
    //   headers: request.headers,
    //   method: request.method,
    //   url: request.url,
    // };
    const query = request.query;

    query.url = query.url;

    if (!query.url) {
      throw new Error('invalid params');
    }

    if (process.env.VERIFY_CODE && query.code !== process.env.VERIFY_CODE) {
      throw new Error('invalid params');
    }

    const option = OPTIONS[query.device] || OPTIONS.pc;
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
    await page.setUserAgent(option.ua);

    await page.goto(query.url, {
      waitUntil: 'networkidle0'
    });

    await page.addStyleTag({
      content: 'body { font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue",  "Microsoft YaHei", sans-serif; }'
    });

    await page.waitFor(500);

    const image = await page.screenshot({
      type: 'jpeg',
      quality: 90,
      fullPage: true
    });

    response.status(200);
    response.set('content-type', 'image/jpeg');
    response.send(image);

  } catch (e) {
    response.status(400);
    response.set('content-type', 'text/plain');
    response.send(Buffer.from(e && e.toString()));

  } finally {
    response.end();
    if (browser !== null) {
      await browser.close();
    }
  }
};
