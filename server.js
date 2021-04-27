const express = require('express');
const app = express();
const { handler } = require('./handler');

app.get('/', function (req, res) {
  handler(req, res, {});
});

app.listen(3000);

console.log('app listen 3000');
