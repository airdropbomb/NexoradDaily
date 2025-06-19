const chalk = require('chalk'); // For coloring the banner
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Colored ASCII banner
console.log(chalk.cyan(`
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔     ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
`));

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
const COOLDOWN = 30 * 60 * 1000; // 30 minutes in milliseconds (default if API doesn't provide)

// Store token timers and last claim times
const tokenTimers = new Map(); // Map<token, { nextClaim: timestamp, interval: NodeJS.Timeout }>

// Format time (e.g., "29m 45s")
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

// Update timer display for all tokens
function updateTimerDisplay() {
    console.clear(); // Clear console for clean display
    console.log(chalk.cyan('=== Nexorad Claim Timer ==='));
    tokens.forEach((token, index) => {
        const timer = tokenTimers.get(token);
        if (timer && timer.nextClaim) {
            const timeLeft = timer.nextClaim - Date.now();
            if (timeLeft > 0) {
                console.log(`Token ${index + 1}: ${formatTime(timeLeft)} left`);
            } else {
                console.log(`Token ${index + 1}: Ready to claim!`);
            }
        } else {
            console.log(`Token ${index + 1}: Initializing...`);
        }
    });
}

function getProxy() {
    if (!useProxy || proxies.length === 0) return null;
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length; // Cycle through proxies
    return proxy;
}

async function claimPoints(token) {
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
    try {
        const response = await axios.get(url, config);
        console.log(`Points claimed for token at ${new Date()}:`, response.data);
        
        // Assume API returns next claim time or use default cooldown
        // Example: response.data.nextClaim = "2025-06-19T16:32:00Z"
        const nextClaim = response.data.nextClaim 
            ? new Date(response.data.nextClaim).getTime()
            : Date.now() + COOLDOWN;
        
        // Update timer
        const existingTimer = tokenTimers.get(token);
        if (existingTimer && existingTimer.interval) {
            clearInterval(existingTimer.interval);
        }
        tokenTimers.set(token, { nextClaim, interval: null });
        startTimer(token);
        
        return response.data;
    } catch (error) {
        console.error(`Error for token at ${new Date()}:`, error.response?.status || error.message);
        // On error, retry after a short delay (e.g., 1 minute)
        const nextClaim = Date.now() + 60 * 1000;
        const existingTimer = tokenTimers.get(token);
        if (existingTimer && existingTimer.interval) {
            clearInterval(existingTimer.interval);
        }
        tokenTimers.set(token, { nextClaim, interval: null });
        startTimer(token);
    }
}

function startTimer(token) {
    const timer = tokenTimers.get(token);
    if (!timer || !timer.nextClaim) return;

    const checkClaim = () => {
        const timeLeft = timer.nextClaim - Date.now();
        if (timeLeft <= 0) {
            // Time's up, trigger claim
            claimPoints(token);
        }
    };

    // Start interval to check every second
    const interval = setInterval(() => {
        checkClaim();
        updateTimerDisplay();
    }, 1000);

    tokenTimers.set(token, { ...timer, interval });
}

// Initialize timers for all tokens
function initializeTimers() {
    tokens.forEach(token => {
        // Assume initial claim is ready or fetch from API
        tokenTimers.set(token, { nextClaim: Date.now(), interval: null });
        claimPoints(token); // Trigger initial claim
    });
    // Start display update
    updateTimerDisplay();
}

// Start the process
initializeTimers();

// Keep process alive
setInterval(() => {}, 1000 * 60 * 60);

console.log(`Started on ${process.platform} at ${new Date()} with ${tokens.length} tokens and proxy usage: ${useProxy}...`);
