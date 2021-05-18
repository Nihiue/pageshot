const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') {
  process.env.LAYER_LIB_PATH = path.join(__dirname, '../').slice(2);
}

const { handler } = require('../index.js');

app.get('/', function(req, res) {
  res.send(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'));
  res.end();
});

app.get('/api/pageshot', async function (req, res) {
  const { statusCode, headers, body } = await handler({
    queryString: req.query
  }, {
    noBase64: true,
    executablePath: process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : ''
  });
  for (key in headers) {
    res.set(key, headers[key]);
  }
  res.status = statusCode;
  res.send(body);
  res.end();
});

app.listen(3000);

console.log('app listen 3000');
