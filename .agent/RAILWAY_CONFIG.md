# Railway Environment Variables Configuration

To deploy with bigmodel.cn API configuration, set the following environment variables in your Railway project:

## Required Environment Variables

```bash
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash
LLM_API_KEY=your_actual_api_key_here
LLM_MAX_TOKENS=4096
LLM_MAX_CONCURRENT_REQUESTS=2
```

## How to Set Environment Variables in Railway

### Option 1: Via Railway Dashboard (Recommended)

1. Go to https://railway.app/dashboard
2. Select your `agent_society` project
3. Click on the service/deployment
4. Go to the **Variables** tab
5. Add each environment variable:
   - `LLM_BASE_URL` = `https://open.bigmodel.cn/api/paas/v4`
   - `LLM_MODEL` = `glm-4-flash`
   - `LLM_API_KEY` = `your_actual_api_key_here`
   - `LLM_MAX_TOKENS` = `4096`
   - `LLM_MAX_CONCURRENT_REQUESTS` = `2`
6. Click **Deploy** to apply changes

### Option 2: Via Railway CLI (Once installed)

```bash
railway variables set LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
railway variables set LLM_MODEL=glm-4-flash
railway variables set LLM_API_KEY=your_actual_api_key_here
railway variables set LLM_MAX_TOKENS=4096
railway variables set LLM_MAX_CONCURRENT_REQUESTS=2
```

## Alternative: Commit Configuration to Repository

If the application doesn't support environment variables for LLM configuration, you can:

1. Copy `config/app.local.json` to `config/app.production.json`
2. Update the API key in `app.production.json`
3. Commit and push to GitHub:
   ```bash
   git add config/app.production.json
   git commit -m "Add production config for Railway"
   git push github master:main
   ```

## Notes

- **Security**: Never commit API keys to the repository
- **Environment**: Railway will automatically redeploy when you update environment variables
- **Verification**: Check Railway deployment logs to ensure the configuration is loaded correctly
