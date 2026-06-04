const https = require('https');
https.get('https://www.nativoenglish.com.br/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.match(/weberty|keziah|eric|jhennifer|cole/gi));
  });
});
