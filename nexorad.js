const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const schedule = require('node-schedule');
const fs = require('fs');
console.log(chalk.cyan(`
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔     ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
`));

// Initialize chalk with fallback to plain text
let chalk = (text) => text;
try {
    chalk = require('chalk');
    console.log(chalk.green('chalk module loaded successfully'));
} catch (e) {
    console.warn('[WARNING] chalk not found, using plain text. Install with: npm install chalk');
}

// Load multiple tokens from tokens.txt, one per line, with error handling
let tokens = [];
try {
    const tokensData = fs.readFileSync('tokens.txt', 'utf8').trim();
    tokens = tokensData.split('\n').filter(token => token.trim());
    if (tokens.length === 0) {
        console.log(chalk.red('[ERROR] ✗ No valid tokens found in tokens.txt'));
        console.log(chalk.yellow('[WARNING] Please create tokens.txt with one token per line and retry.'));
        process.exit(1);
    }
} catch (error) {
    console.log(chalk.red(`[ERROR] ✗ Error reading tokens.txt: ${error.message}`));
    console.log(chalk.yellow('[WARNING] Please create tokens.txt with one token per line and retry.'));
    process.exit(1);
}

// Load proxies from proxy.txt, one per line (e.g., http://user:pass@host:port)
let proxies = [];
try {
    const proxyData = fs.readFileSync('proxy.txt', 'utf8').trim();
    proxies = proxyData.split('\n').filter(proxy => proxy.trim());
} catch (error) {
    console.log(chalk.yellow(`[WARNING] Error reading proxy.txt: ${error.message}. Continuing without proxies.`));
}
let proxyIndex = 0;

// Option to use proxies (set to false to disable)
const useProxy = false;

const url = 'https://nexorad-backend.onrender.com/waitlist/claim/nxp';

// Function to extract email from JWT token
function extractEmailFromToken(token) {
    try {
        const payload = token.split('.')[1];
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const data = JSON.parse(decoded);
        return data.email || 'Unknown Email';
    } catch (e) {
        return 'Unknown Email';
    }
}

function getProxy() {
    if (!useProxy || proxies.length === 0) return null;
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;
    return proxy;
}

async function claimPoints(token) {
    const email = extractEmailFromToken(token);
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6831.83 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,my;q=0.7',
        'Origin': 'https://waitlist.nexorad.io',
        'Referer': 'https://waitlist.nexorad.io/',
        'Sec-Ch-Ua': '"(Not(A:Brand";v="99", "Google Chrome";v="132", "Chromium";v="132"',
        'Sec-Ch-Ua-Full-Version-List': '"(Not(A:Brand";v="99.0.0.0", "Google Chrome";v="132", "Chromium";v="132"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Priority': 'u=1, i',
        'X-Unique-ID': uuidv4()
    };

    const proxy = getProxy();
    const config = proxy ? {
        headers,
        proxy: {
            protocol: 'http',
            host: proxy.split('@')[1].split(':')[0],
            port: parseInt(proxy.split(':')[1]),
            auth: { username: proxy.split('@')[0].split(':')[0], password: proxy.split('@')[0].split(':')[1] }
        }
    } : { headers };

    const timestamp = new Date().toLocaleString('en-US');
    console.log(`[INFO] ${timestamp} - Starting claim for ${email} with proxy: ${proxy || 'None'}...`);

    try {
        const startTime = Date.now();
        const response = await axios.put(url, {}, config);
        const { data } = response;
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(chalk.green(`[SUCCESS] ${timestamp} - Claim processed for ${email} in ${elapsedTime}s:`));
        console.log(`  - Message: ${data.message || 'Claim successful'}`);
        console.log(`  - Points Claimed: ${data.pointsClaimed || 'N/A'}`);
        console.log(`  - Total Points: ${data.totalPoints || 'N/A'}`);
    } catch (error) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const errorMsg = error.response?.status
            ? `Status: ${error.response.status} - ${error.response.data?.message || error.message}`
            : error.message;
        console.log(chalk.red(`[ERROR] ${timestamp} - Failed to claim for ${email} in ${elapsedTime}s: ${errorMsg}`));
    }
}

async function claimForAllTokens() {
    const timestamp = new Date().toLocaleString('en-US');
    console.log(chalk.blue(`[PROCESS] ${timestamp} - Starting claims for ${tokens.length} tokens...`));

    for (let i = 0; i < tokens.length; i++) {
        const email = extractEmailFromToken(tokens[i]);
        console.log(`[PROCESS] ${timestamp} - Processing token ${i + 1} of ${tokens.length} for ${email}...`);
        await claimPoints(tokens[i]);
        if (i < tokens.length - 1) {
            console.log(`[WAIT] ${timestamp} - Waiting 5 seconds before next token for ${email}...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.log(chalk.blue(`[COMPLETE] ${timestamp} - Finished processing all tokens.`));
}

// Schedule every hour
schedule.scheduleJob('0 * * * *', claimForAllTokens);

// Manual trigger for immediate test
const startTime = new Date().toLocaleString('en-US');
console.log(chalk.blue(`[START] ${startTime} - Script started on ${process.platform} with ${tokens.length} tokens and proxy usage: ${useProxy}...`));
claimForAllTokens();

// Keep process alive
setInterval(() => {}, 1000 * 60 * 60);
