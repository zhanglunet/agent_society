# Railway Deployment Troubleshooting Guide

## Current Issue

**Error**: Application failed to respond at https://mcp.cab/web/
**Request ID**: AZcODhwrQgKJXqi8V7rehQ
**Cause**: Application logic is failing to handle requests or has crashed

## Common Causes & Solutions

### 1. Missing or Incorrect Environment Variables

The application requires specific configuration to run. Check if these are set in Railway:

#### Required Environment Variables:
```bash
# LLM Configuration (if using environment variables)
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash
LLM_API_KEY=your_actual_api_key_here

# Port Configuration (Railway provides this automatically)
PORT=3000
```

**How to Check/Fix**:
1. Go to https://railway.app/dashboard
2. Select `agent_society` project
3. Click on your service
4. Go to **Variables** tab
5. Verify all required variables are set
6. Add missing variables if needed

---

### 2. Incorrect Start Command

The application uses **Bun** runtime, not Node.js.

#### Correct Start Command:
```bash
bun run start.js
```

**How to Check/Fix**:
1. In Railway dashboard, go to your service
2. Click on **Settings** tab
3. Find **Start Command** or **Custom Start Command**
4. Ensure it's set to: `bun run start.js`
5. If not set, Railway should auto-detect from `package.json`

---

### 3. Missing Bun Runtime

Railway needs to know to use Bun instead of Node.js.

**How to Fix**:

Create a `nixpacks.toml` file in the repository root:

```toml
[phases.setup]
nixPkgs = ["bun"]

[start]
cmd = "bun run start.js"
```

Or use Railway's Bun buildpack.

---

### 4. Port Binding Issues

The application must listen on the PORT environment variable provided by Railway.

**Check `start.js`**:
The application should use `process.env.PORT` or default to 3000:
```javascript
const port = process.env.PORT || 3000;
```

---

### 5. Configuration File Not Found

The application looks for configuration files in the `config/` directory.

**Required Files**:
- `config/app.json` (base configuration)
- `config/app.railway.json` (production override) - ✅ Already created
- `config/logging.json` (logging configuration)

**How to Fix**:
1. Ensure `config/app.railway.json` exists in the repository
2. Set environment variable to use it:
   ```bash
   NODE_ENV=production
   CONFIG_FILE=config/app.railway.json
   ```

---

### 6. Missing Dependencies

Ensure all dependencies are installed during build.

**Check**:
- `package.json` has all required dependencies
- Railway build logs show successful `bun install`

---

## Step-by-Step Diagnosis

### Step 1: Check Deployment Logs

1. Go to https://railway.app/dashboard
2. Select `agent_society` project
3. Click on **Deployments** tab
4. Click on the latest deployment
5. View the **Build Logs** and **Deploy Logs**

**Look for**:
- Build errors
- Missing dependencies
- Runtime errors
- Port binding errors

### Step 2: Check Environment Variables

1. Go to **Variables** tab
2. Verify these are set:
   - `PORT` (usually auto-set by Railway)
   - `LLM_API_KEY` (if using environment variables)
   - Any other required variables

### Step 3: Check Start Command

1. Go to **Settings** tab
2. Verify **Start Command** is correct
3. If empty, Railway uses `package.json` scripts

### Step 4: Test Configuration Locally

Run the application locally with the same configuration:

```bash
cd /Users/john/antigravity/agent_society
bun install
bun run start.js
```

If it works locally, the issue is Railway-specific.

---

## Quick Fixes to Try

### Fix 1: Redeploy

Sometimes a simple redeploy fixes the issue:
1. Go to Railway dashboard
2. Click **Deploy** → **Redeploy**

### Fix 2: Add nixpacks.toml

Create `nixpacks.toml` in repository root:

```toml
[phases.setup]
nixPkgs = ["bun"]

[phases.install]
cmds = ["bun install"]

[start]
cmd = "bun run start.js"
```

Commit and push to GitHub.

### Fix 3: Set Environment Variables

Add these in Railway Variables tab:
```
PORT=3000
NODE_ENV=production
LLM_API_KEY=your_actual_key
```

### Fix 4: Check Railway Service Settings

Ensure:
- **Root Directory**: `/` (or leave empty)
- **Build Command**: `bun install` (or auto-detect)
- **Start Command**: `bun run start.js`

---

## Expected Deployment Logs

### Successful Build:
```
Installing dependencies...
bun install
Dependencies installed successfully
```

### Successful Start:
```
Starting application...
bun run start.js
Server listening on port 3000
```

---

## Next Steps

1. **Check Railway Logs** - This is the most important step
2. **Verify Environment Variables** - Ensure API key is set
3. **Check Start Command** - Must use `bun run start.js`
4. **Add nixpacks.toml** - If Railway doesn't detect Bun
5. **Redeploy** - After making changes

---

## Need Help?

If the issue persists after trying these fixes:
1. Share the Railway deployment logs
2. Check if the application works locally
3. Verify all configuration files are in the repository
