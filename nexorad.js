const chalk = require('chalk'); // For coloring the banner

// Colored ASCII banner
console.log(chalk.cyan(`
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔     ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
`));

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const schedule = require('node-schedule');
const fs = require('fs');

// Load multiple tokens from tokens.txt, one per line, with error handling
let tokens = [];
try {
    const tokensData = fs.readFileSync('tokens.txt', 'utf8').trim();
    tokens = tokensData.split('\n').filter(token => token.trim());
    if (tokens.length === 0) {
        console.error('No valid tokens found in tokens.txt');
    }
} catch (error) {
    console.error('Error reading tokens.txt:', error.message);
    console.log('Please create tokens.txt with one token per line and retry.');
    process.exit(1); // Exit if tokens file is missing
}

// Load proxies from proxy.txt, one per line (e.g., http://user:pass@host:port), with optional handling
let proxies = [];
try {
    if (fs.existsSync('proxy.txt')) {
        const proxiesData = fs.readFileSync('proxy.txt', 'utf8').trim();
        proxies = proxiesData.split('\n').filter(proxy => proxy.trim());
        if (proxies.length === 0) {
            console.log('proxy.txt is empty; proceeding without proxies.');
        }
    } else {
        console.log('proxy.txt not found; proceeding without proxies.');
    }
} catch (error) {
    console.error('Error reading proxy.txt:', error.message);
    console.log('Proceeding without proxies.');
}

let proxyIndex = 0;

// Option to use proxies (set to false to disable)
const useProxy = false; // Change to true to enable proxies if available

const url = 'https://nexorad-backend.onrender.com/waitlist/user/stats/points';

function getProxy() {
    if (!useProxy || proxies.length === 0) return null;
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length; // Cycle through proxies
    return proxy;
}

function claimPoints(token) {
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-Unique-ID': uuidv4()
    };

    const proxy = getProxy();
    let config;
    if (proxy) {
        try {
            const [auth, hostPort] = proxy.split('@');
            const [username, password] = auth.split(':');
            const [host, port] = hostPort.split(':');
            config = {
                headers,
                proxy: {
                    protocol: 'http',
                    host,
                    port: parseInt(port),
                    auth: { username, password }
                }
            };
        } catch (error) {
            console.error(`Invalid proxy format: ${proxy}. Skipping proxy for this request.`);
            config = { headers };
        }
    } else {
        config = { headers };
    }

    console.log(`Attempting to claim points for token at ${new Date()} with proxy: ${proxy || 'None'}...`);
    return axios.get(url, config)
        .then(response => {
            console.log(`Points claimed for token at ${new Date()}:`, response.data);
        })
        .catch(error => {
            console.error(`Error for token at ${new Date()}:`, error.response?.status || error.message);
        });
}

function claimForAllTokens() {
    tokens.forEach(token => claimPoints(token));
}

// Schedule every hour
schedule.scheduleJob('0 * * * *', claimForAllTokens);

// Manual trigger for immediate test
claimForAllTokens();

// Keep process alive
setInterval(() => {}, 1000 * 60 * 60);

console.log(`Started on ${process.platform} at ${new Date()} with ${tokens.length} tokens and proxy usage: ${useProxy}...`);
