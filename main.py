import asyncio
import json
import base64
import time
import os
import platform
from datetime import datetime
import aiohttp
from aiofiles import open as async_open
from colorama import Fore, Style  # Added for colored banner output

# Welcome method with corrected banner formatting
def welcome(self=None):  # self=None allows standalone call
    print(
        f"""
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔╝    ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
        By : ADB NODE
        {Fore.GREEN + Style.BRIGHT}Auto Ping {Fore.BLUE + Style.BRIGHT}SowingTaker - BOT
        {Fore.GREEN + Style.BRIGHT}Rey? {Fore.YELLOW + Style.BRIGHT}<https://t.me/airdropbombnode>
        """
    )

# Initialize color output (simplified fallback)
def color_text(text, color=None):
    return text  # No color support in basic Python console

# Log to file for VPS monitoring
async def log_message(message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f'{timestamp} - {message}\n'
    async with async_open('bot.log', 'a') as f:
        await f.write(log_entry)

# Load tokens
async def load_tokens():
    tokens = []
    try:
        async with async_open('tokens.txt', 'r') as f:
            content = await f.read()
            tokens = [t.strip() for t in content.split('\n') if t.strip()]
        if not tokens:
            await log_message('[ERROR] No valid tokens found in tokens.txt')
            print(color_text('[ERROR] ✗ No valid tokens found in tokens.txt', 'red'))
            print(color_text('[WARNING] Please create tokens.txt with one token per line and retry.', 'yellow'))
            exit(1)
    except Exception as e:
        await log_message(f'[ERROR] Error reading tokens.txt: {str(e)}')
        print(color_text(f'[ERROR] ✗ Error reading tokens.txt: {str(e)}', 'red'))
        print(color_text('[WARNING] Please create tokens.txt with one token per line and retry.', 'yellow'))
        exit(1)
    return tokens

# Load proxies
async def load_proxies():
    proxies = []
    try:
        async with async_open('proxy.txt', 'r') as f:
            content = await f.read()
            proxies = [p.strip() for p in content.split('\n') if p.strip()]
    except Exception as e:
        await log_message(f'[WARNING] Error reading proxy.txt: {str(e)}. Continuing without proxies.')
        print(color_text(f'[WARNING] Error reading proxy.txt: {str(e)}. Continuing without proxies.', 'yellow'))
    return proxies

# Extract email from token
def extract_email(token):
    try:
        payload = token.split('.')[1]
        decoded = base64.b64decode(payload + '==').decode('utf-8')
        data = json.loads(decoded)
        return data.get('email', 'Unknown Email')
    except Exception:
        return 'Unknown Email'

async def get_remaining_time(token, proxy=None):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6831.83 Safari/537.36',
    }
    url = 'https://waitlist.nexorad.io/api/stats'
    fallback_url = 'https://nexorad-backend.onrender.com/waitlist/user/stats/points'  # Fallback URL
    proxy_url = f'http://{proxy}' if proxy else None

    async with aiohttp.ClientSession() as session:
        for attempt in range(3):
            try:
                async with session.get(url, headers=headers, proxy=proxy_url, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        remaining_time = data.get('cooldown', '0:00:00')
                        current_points = data.get('points', 0)
                        await log_message(f'[INFO] Remaining time for {extract_email(token)}: {remaining_time}, Points: {current_points}')
                        print(f'[INFO] {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} - Remaining cooldown time: {remaining_time}, Current Points: {current_points} NXP')
                        return {'remainingTime': remaining_time, 'currentPoints': current_points}
                    elif response.status == 400:
                        await log_message(f'[ERROR] Bad request for {extract_email(token)}: Status 400, Response: {await response.text()}')
                        print(color_text(f'[ERROR] {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} - Failed to get stats: Status 400, Response: {await response.text()}', 'red'))
                        # Try fallback URL
                        async with session.get(fallback_url, headers=headers, proxy=proxy_url, timeout=10) as fallback_response:
                            if fallback_response.status == 200:
                                data = await fallback_response.json()
                                remaining_time = data.get('lastClaim') and '1:00:00' or '0:00:00'  # Adjust based on actual response
                                current_points = data.get('totalPoints', 0)
                                await log_message(f'[INFO] Fallback success for {extract_email(token)}: {remaining_time}, Points: {current_points}')
                                print(f'[INFO] {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} - Fallback cooldown time: {remaining_time}, Points: {current_points} NXP')
                                return {'remainingTime': remaining_time, 'currentPoints': current_points}
                    await asyncio.sleep(2 ** attempt)
            except Exception as e:
                await log_message(f'[ERROR] Failed to get remaining time for {extract_email(token)}: {str(e)}')
                print(color_text(f'[ERROR] {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} - Failed to get remaining time: {str(e)}', 'red'))
                await asyncio.sleep(2 ** attempt)
        return {'remainingTime': '0:00:00', 'currentPoints': 0}

async def claim_points(token, claimed_tokens, proxies, proxy_index):
    email = extract_email(token)
    if token in claimed_tokens:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        await log_message(f'[SKIP] Token {email} already claimed')
        print(color_text(f'[SKIP] {timestamp} - Token {email} already claimed, skipping...', 'yellow'))
        return

    proxy = proxies[proxy_index] if proxies and proxy_index < len(proxies) else None
    proxy_index = (proxy_index + 1) % len(proxies) if proxies else 0
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    await log_message(f'[INFO] Starting claim for {email} with proxy: {proxy or "None"}')
    print(f'[INFO] {timestamp} - Starting claim for {email} with proxy: {proxy or "None"}...')

    data = await get_remaining_time(token, proxy)
    remaining_time = data['remainingTime']
    current_points = data['currentPoints']
    print(f'[INFO] {timestamp} - Remaining cooldown time: {remaining_time}, Current Points: {current_points} NXP')

    if remaining_time != '0:00:00':
        await log_message(f'[SKIP] Claim skipped for {email}, {remaining_time} remaining')
        print(color_text(f'[SKIP] {timestamp} - Claim skipped for {email}, {remaining_time} remaining...', 'yellow'))
        print(f'  - Points Claimed: 0')
        print(f'  - Total Points: {current_points} NXP')
        if token not in claimed_tokens:
            claimed_tokens.append(token)
            async with async_open('claimed_tokens.txt', 'a') as f:
                await f.write(f'{token}\n')
        return

    claim_url = 'https://nexorad-backend.onrender.com/waitlist/claim/nxp'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': f'Mozilla/5.0 ({platform.system()} NT {platform.release()}; {platform.machine()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6831.83 Safari/537.36',
    }
    proxy_url = f'http://{proxy}' if proxy else None

    async with aiohttp.ClientSession() as session:
        for attempt in range(3):
            try:
                start_time = time.time()
                async with session.put(claim_url, headers=headers, proxy=proxy_url, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        elapsed_time = time.time() - start_time
                        points_claimed = data.get('pointsClaimed', 100)
                        total_points = current_points + points_claimed
                        await log_message(f'[SUCCESS] Claim processed for {email} in {elapsed_time:.2f}s, Points: {points_claimed}')
                        print(color_text(f'[SUCCESS] {timestamp} - Claim processed for {email} in {elapsed_time:.2f}s:', 'green'))
                        print(f'  - Message: {data.get("message", "Claim successful")}')
                        print(f'  - Points Claimed: {points_claimed} NXP')
                        print(f'  - Total Points: {total_points} NXP')
                        if token not in claimed_tokens:
                            claimed_tokens.append(token)
                            async with async_open('claimed_tokens.txt', 'a') as f:
                                await f.write(f'{token}\n')
                        return
                    elif response.status == 400:
                        await log_message(f'[ERROR] Failed to claim for {email}: Status 400, Response: {await response.text()}')
                        print(color_text(f'[ERROR] {timestamp} - Failed to claim for {email}: Status 400, Response: {await response.text()}', 'red'))
                        break
                    await asyncio.sleep(2 ** attempt)
            except Exception as e:
                await log_message(f'[ERROR] Failed to claim for {email}: {str(e)}')
                print(color_text(f'[ERROR] {timestamp} - Failed to claim for {email}: {str(e)}', 'red'))
                print(f'  - Points Claimed: 0')
                print(f'  - Total Points: {current_points} NXP')
                await asyncio.sleep(2 ** attempt)
        if token not in claimed_tokens:
            claimed_tokens.append(token)
            async with async_open('claimed_tokens.txt', 'a') as f:
                await f.write(f'{token}\n')

async def claim_for_all_tokens():
    tokens = await load_tokens()
    proxies = await load_proxies()
    claimed_tokens = []
    try:
        async with async_open('claimed_tokens.txt', 'r') as f:
            content = await f.read()
            claimed_tokens = [t.strip() for t in content.split('\n') if t.strip()]
    except FileNotFoundError:
        await log_message('[WARNING] No claimed_tokens.txt found. Creating new file.')
        print(color_text('[WARNING] No claimed_tokens.txt found. Creating new file.', 'yellow'))
        async with async_open('claimed_tokens.txt', 'w') as f:
            await f.write('')

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    await log_message(f'[PROCESS] Starting claims for {len(tokens)} tokens')
    print(color_text(f'[PROCESS] {timestamp} - Starting claims for {len(tokens)} tokens...', 'blue'))
    proxy_index = 0
    for i, token in enumerate(tokens):
        await log_message(f'[PROCESS] Processing token {i + 1} of {len(tokens)} for {extract_email(token)}')
        print(f'[PROCESS] {timestamp} - Processing token {i + 1} of {len(tokens)} for {extract_email(token)}...')
        await claim_points(token, claimed_tokens, proxies, proxy_index)
        if i < len(tokens) - 1:
            await log_message(f'[WAIT] Waiting 5 seconds before next token')
            print(f'[WAIT] {timestamp} - Waiting 5 seconds before next token...')
            await asyncio.sleep(5)

    await log_message(f'[COMPLETE] Finished processing all tokens')
    print(color_text(f'[COMPLETE] {timestamp} - Finished processing all tokens.', 'blue'))

async def schedule_claims():
    while True:
        await claim_for_all_tokens()
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        await log_message(f'[SCHEDULE] Waiting 1 hour for next claim cycle')
        print(color_text(f'[SCHEDULE] {timestamp} - Waiting 1 hour for next claim cycle...', 'yellow'))
        await asyncio.sleep(3600)

async def main():
    welcome()  # Call the welcome method to display the banner
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    tokens = await load_tokens()
    proxies = await load_proxies()
    await log_message(f'[START] Script started on {os.name} with {len(tokens)} tokens and proxy usage: {bool(proxies)}')
    print(color_text(f'[START] {timestamp} - Script started on {os.name} with {len(tokens)} tokens and proxy usage: {bool(proxies)}...', 'blue'))
    await schedule_claims()

if __name__ == "__main__":
    asyncio.run(main())
