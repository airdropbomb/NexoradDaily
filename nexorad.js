const chalk = require('chalk');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const UserAgent = require('user-agents');

// Colored ASCII banner
const banner = `
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔     ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
`;

// Show banner only once at startup
console.log(chalk.cyan(banner));

// Load tokens from tokens.txt
let tokens = [];
try {
  const tokensData = fs.readFileSync('tokens.txt', 'utf8').trim();
  tokens = tokensData.split('\n').filter(token => token.trim());
  if (tokens.length === 0) {
    console.error(chalk.red('No valid tokens found in tokens.txt'));
    process.exit(1);
  }
} catch (error) {
  console.error(chalk.red('Error reading tokens.txt:', error.message));
  console.log('Please create tokens.txt with one token per line.');
  process.exit(1);
}

// Load proxies from proxy.txt (optional)
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

// Proxy setting
const useProxy = false; // Change to true to enable proxies
const statsUrl = 'https://nexorad-backend.onrender.com/waitlist/user/stats/points';
const claimUrl = 'https://nexorad-backend.onrender.com/waitlist/claim/nxp';
const COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

// Store token timers
const tokenTimers = new Map();

// Format time (e.g., "59m 45s")
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Update timer display
function updateTimerDisplay() {
  process.stdout.write('\x1B[?25l'); // Hide cursor
  process.stdout.write(`\x1B[${tokens.length}A`); // Move cursor up
  tokens.forEach((token, index) => {
    const timer = tokenTimers.get(token);
    const timeLeft = timer?.nextClaim ? timer.nextClaim - Date.now() : 0;
    const line = `Token ${index + 1}: ${timeLeft > 0 ? formatTime(timeLeft) : 'Ready to claim!'}\r\n`;
    process.stdout.write(line);
  });
  process.stdout.write('\x1B[?25h'); // Show cursor
}

function getProxy() {
  if (!useProxy || proxies.length === 0) return null;
  const proxy = proxies[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  return proxy;
}

async function claimPoints(token) {
  const userAgent = new UserAgent();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': userAgent.toString(),
    'X-Unique-ID': uuidv4(),
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
          auth: { username, password },
        },
      };
    } catch (error) {
      console.error(`Invalid proxy format: ${proxy}. Skipping proxy`);
      config = { headers };
    }
  } else {
    config = { headers };
  }

  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  console.log(`Attempting to claim 100 NXP for token at ${now} with proxy: ${proxy || 'none'}...`);

  try {
    // Step 1: Perform claim action (POST request)
    const claimResponse = await axios.post(claimUrl, { amount: 100 }, config);
    console.log(chalk.green(`Claim successful for Token ${tokens.indexOf(token) + 1} at ${now}`));

    // Step 2: Fetch updated points (GET request)
    const statsResponse = await axios.get(statsUrl, config);
    const data = statsResponse.data?.data || {};
    const invitePoints = data.invitePoints ?? 'N/A';
    const taskPoints = data.taskPoints ?? 'N/A';
    const totalPoints = data.totalPoints ?? 'N/A';
    const claimedPoints = data.claimedPoints ?? 'N/A';

    // Display points
    if (invitePoints !== 'N/A' || taskPoints !== 'N/A' || totalPoints !== 'N/A' || claimedPoints !== 'N/A') {
      console.log(chalk.blue(`Token ${tokens.indexOf(token) + 1} Points at ${now}:`));
      if (invitePoints !== 'N/A') console.log(chalk.cyan(`  Invite Points: ${invitePoints}`));
      if (taskPoints !== 'N/A') console.log(chalk.yellow(`  Task Points: ${taskPoints}`));
      if (totalPoints !== 'N/A') console.log(chalk.green(`  Total Points: ${totalPoints}`));
      if (claimedPoints !== 'N/A') console.log(chalk.magenta(`  Claimed Points: ${claimedPoints}`));
    } else {
      console.log(chalk.red(`No points data available for Token ${tokens.indexOf(token) + 1}`));
    }

    // Set next claim
    const nextClaim = Date.now() + COOLDOWN;
    console.log(chalk.gray(`[Debug] Next claim scheduled for ${new Date(nextClaim).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}`));

    // Update timer
    const existingTimer = tokenTimers.get(token);
    if (existingTimer?.interval) {
      clearInterval(existingTimer.interval);
    }
    tokenTimers.set(token, { nextClaim, interval: null });
    startTimer(token);

    return { claimResponse: claimResponse.data, statsResponse: statsResponse.data };
  } catch (error) {
    console.error(chalk.red(`Error for Token ${tokens.indexOf(token) + 1} at ${now}:`, error.response?.status || error.message));
    if (error.response) {
      console.log(chalk.gray(`Error response data:`, JSON.stringify(error.response.data, null, 2)));
    }

    // Retry after 5 minutes on error
    const nextClaim = Date.now() + 5 * 60 * 1000;
    console.log(chalk.gray(`[Debug] Retry scheduled for ${new Date(nextClaim).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}`));

    const existingTimer = tokenTimers.get(token);
    if (existingTimer?.interval) {
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
      console.log(chalk.gray(`[Debug] Token ${tokens.indexOf(token) + 1}: Time left: ${formatTime(timeLeft)} - Triggering claim`));
      clearInterval(timer.interval); // Stop current interval
      tokenTimers.set(token, { ...timer, interval: null }); // Clear interval in timer
      claimPoints(token); // Trigger claim
    } else if (Math.floor(timeLeft / 1000) % 10 === 0) {
      console.log(chalk.gray(`[Debug] Token ${tokens.indexOf(token) + 1}: Time left: ${formatTime(timeLeft)}`));
    }
  };

  // Clear existing interval
  if (timer.interval) {
    clearInterval(timer.interval);
  }

  // Start new interval
  const interval = setInterval(checkClaim, 1000);
  tokenTimers.set(token, { ...timer, interval });
}

// Initialize timers
function initializeTimers() {
  tokens.forEach(() => console.log('')); // Reserve space for timers
  tokens.forEach(token => {
    tokenTimers.set(token, { nextClaim: Date.now(), interval: null });
    claimPoints(token);
  });
  updateTimerDisplay();
}

// Start process
initializeTimers();

// Keep process alive
setInterval(() => {}, 1000 * 60 * 60);

console.log(`Started on ${process.platform} at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })} with ${tokens.length} tokens and proxy usage: ${useProxy}...`);
