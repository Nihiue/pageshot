process.env.FUNCTION_NAME = 'pageshot';
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_node12';
process.env.HOME = process.env.TEMP || '/tmp';

const path = require('path');
const chromium = require('chrome-aws-lambda');

const DEVICES = {
  pc: {
    width: 1920,
    height: 1080,
    dpr: 1.5,
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

function sleep(dur = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, dur);
  });
}

let fontsDownloaded = false;

async function downloadFonts() {
  if (fontsDownloaded) {
    return;
  }
  const fonts = [
    'NotoColorEmoji.ttf',
    'msyh.ttc',
    'PingFang_Regular.ttf',
    'PingFang_Bold.ttf',
    'PingFang_Medium.ttf',
    'SF-Pro-Display-Bold.otf',
    'SF-Pro-Display-Regular.otf',
    'SF-Pro-Display-Medium.otf'
  ];
  await Promise.all(fonts.map((name) => {
    return chromium.font(path.join(process.env.LAYER_LIB_PATH || __dirname, `fonts/${name}`));
  }));
  fontsDownloaded = true;
}


exports.handler = async (event = {}, context = {}) => {
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
    const query = event.queryString || event.queryStringParameters;

    if (process.env.VERIFY_CODE && query.code !== process.env.VERIFY_CODE) {
      throw new Error('invalid params');
    }

    if (!query.url) {
      throw new Error('invalid params');
    }

    const options = {
      url: query.url,
      device: DEVICES[query.device] || DEVICES.pc,
      font: Boolean(query.font),
      full: Boolean(query.full),
      script: query.script,
      cookies: query.cookies
    };

    await downloadFonts();
    const args = chromium.args.concat(['--font-render-hinting=none']);
    browser = await chromium.puppeteer.launch({
      args: args,
      executablePath: context.executablePath || await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    let cookies = [];

    if (options.cookies) {
      const parsedUrl = new URL(options.url);
      cookies = options.cookies.split(';').map(t => t.split('=')).filter(p => p.length === 2).map(p => {
        return {
          name: p[0].trim(),
          value: p[1].trim(),
          domain: parsedUrl.hostname,
        };
      });
    }

    await Promise.all([
      page.setViewport({
        width: options.device.width,
        height: options.device.height,
        deviceScaleFactor: options.device.dpr,
        isMobile: options.isMobile,
        hasTouch: options.isMobile
      }),
      page.setUserAgent(options.device.ua),
      page.emulateTimezone('Asia/Shanghai'),
      page.setCookie(...cookies)
    ]);

    await page.goto(options.url, {
      waitUntil: 'networkidle0'
    });

    if (options.font) {
      await page.addStyleTag({
        path: path.join(__dirname, 'style.css')
      });
    }
    await sleep(500);

    if (options.script) {
      await page.evaluate(options.script);
      await sleep(500);
    }

    const capOpt = {
      type: 'jpeg',
      quality: 90,
      fullPage: Boolean(options.full)
    };

    if (context.usePNG) {
      capOpt.type = 'png';
      delete capOpt.quality;
      resp.headers['Content-Type'] = 'image/png';
    }

    const image = await page.screenshot(capOpt);

    if (context.noBase64) {
      resp.isBase64Encoded = false;
      resp.body = image;
    } else {
      resp.body = image.toString('base64');
    }
  } catch (e) {
    resp.isBase64Encoded = false;
    resp.statusCode = 400;
    resp.headers['Content-Type'] = 'text/plain';
    resp.body = e && e.toString();
  } finally {
    browser && browser.close();
    browser = null;
    return resp;
  }
};
