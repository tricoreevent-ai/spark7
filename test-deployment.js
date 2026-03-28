// test-deployment.js
import https from 'https';
import http from 'http';

// Replace with your actual domain
const BASE_URL = 'http://localhost:3000'; // Change this to your production URL for deployment testing

console.log(`Testing connection to: ${BASE_URL}...`);

const client = BASE_URL.startsWith('https') ? https : http;

client.get(`${BASE_URL}/api/health`, (resp) => {
  let data = '';

  // A chunk of data has been received.
  resp.on('data', (chunk) => {
    data += chunk;
  });

  // The whole response has been received.
  resp.on('end', () => {
    console.log('Status Code:', resp.statusCode);
    if (resp.statusCode === 200 || resp.statusCode === 401) {
        console.log('✅ Server is reachable!');
    } else {
        console.log('⚠️ Server returned unexpected status.');
    }
    console.log('Response Preview:', data.substring(0, 100));
  });

}).on("error", (err) => {
  console.log("❌ Error: " + err.message);
});
 