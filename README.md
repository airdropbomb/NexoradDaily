# 🌐 NEXORAD Daily Claim

A lightweight automation script for joining the [Nexorad](https://waitlist.nexorad.io?inviterCode=SI368VJT) Web3 waitlist using rotating proxies and an invite code.

## ⚙️ Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/airdropbomb/NexoradDaily.git && cd NexoradDaily
   ```

2. **Add Your Bearer Token**

   Add a `token.txt` file in the root directory with this content:

   ```
   nano tokens.txt
   ```

3. **Add Proxies**

   Add one proxy per line in `proxy.txt`:

   ```
   192.168.0.1:8080
   192.168.0.2:9090:username:password
   ```

4. **Install Dependencies**

   ```
   npm install
   ```

## ▶️ Run the Script

```bash
node index.js
```
