const chalk = require('chalk'); // For coloring the banner and output
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const UserAgent = require('user-agents'); // For random User Agent

// Colored ASCII banner
const banner = `
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔     ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
`;

// Show banner only once at script start
console.log(chalk.cyan(banner));

// Load multiple tokens from tokens.txt, one per line, with error handling
let tokens = [];
try {
    const tokensData = fs.readFileSync('tokens.txt', 'utf8').trim();
    tokens = tokensData.split('\n').filter(token => token.trim());
    if (tokens.length === 0) {
        console.error('No valid tokens found in tokens.txt');
        process.exit(1);
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
const COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

// Store token timers
const tokenTimers = new Map(); // Map<token, { nextClaim: timestamp, interval: NodeJS.Timeout }>

// Format time (e.g., "59m 45s")
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

// Update timer display for all tokens
function updateTimerDisplay() {
    process.stdout.write('\x1B[?25l'); // Hide cursor
    // Move cursor up to start of timer lines (based on number of tokens)
    process.stdout.write(`\x1B[${tokens.length}A`);
    tokens.forEach((token, index) => {
        const timer = tokenTimers.get(token);
        const timeLeft = timer && timer.nextClaim ? timer.nextClaim - Date.now() : 0;
        const line = `Token ${index + 1}: ${timeLeft > 0 ? formatTime(timeLeft) : 'Ready to claim!'}\r\n`;
        process.stdout.write(line);
    });
    process.stdout.write('\x1B[?25h'); // Show cursor
}

function getProxy() {
    if (!useProxy || proxies.length === 0) return null;
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length; // Cycle through proxies
    return proxy;
}

async function claimPoints(token) {
    const userAgent = new UserAgent(); // Generate random User Agent
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': userAgent.toString(), // Use random User Agent
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

        // Access nested data object
        const data = response.data?.data || {};
        const invitePoints = data.invitePoints ?? 'N/A';
        const taskPoints = data.taskPoints ?? 'N/A';
        const totalPoints = data.totalPoints ?? 'N/A';
        const claimedPoints = data.claimedPoints ?? 'N/A';

        // Display points if available
        if (invitePoints !== 'N/A' || taskPoints !== 'N/A' || totalPoints !== 'N/A' || claimedPoints !== 'N/A') {
            console.log(chalk.blue(`Token ${tokens.indexOf(token) + 1} Points Claimed at ${new Date()}:`));
            if (invitePoints !== 'N/A') console.log(chalk.cyan(`  Invite Points: ${invitePoints}`));
            if (taskPoints !== 'N/A') console.log(chalk.yellow(`  Task Points: ${taskPoints}`));
            if (totalPoints !== 'N/A') console.log(chalk.green(`  Total Points: ${totalPoints}`));
            if (claimedPoints !== 'N/A') console.log(chalk.magenta(`  Claimed Points: ${claimedPoints}`));
        } else {
            console.log(chalk.red(`No points data available for Token ${tokens.indexOf(token) + 1}`));
        }

        // Set next claim to 1 hour from now
        const nextClaim = Date.now() + COOLDOWN;

        // Update timer
        const existingTimer = tokenTimers.get(token);
        if (existingTimer && existingTimer.interval) {
            clearInterval(existingTimer.interval);
        }
        tokenTimers.set(token, { nextClaim, interval: null });
        startTimer(token);

        return response.data;
    } catch (error) {
        console.error(chalk.red(`Error for Token ${tokens.indexOf(token) + 1} at ${new Date()}:`, error.response?.status || error.message));
        if (error.response) {
            console.log(chalk.gray(`Error Response Data:`, JSON.stringify(error.response.data, null, 2)));
        }

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
    // Removed duplicate banner display
    // Print empty lines to reserve space for timers
    tokens.forEach(() => console.log(''));
    tokens.forEach(token => {
        // Assume initial claim is ready
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
