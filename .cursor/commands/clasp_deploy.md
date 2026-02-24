---
description: Deploy the Google Apps Script project using clasp CLI
---

Deploy this Google Apps Script project to Google using `clasp`.

## Prerequisites Check

Before deploying, verify:

1. **clasp installed**: `which clasp`
2. **clasp authenticated**: credentials exist at `~/.clasprc.json`
3. **Inside the project**: `.clasp.json` exists in the working directory

Run all prerequisite checks and report any failures before proceeding.

## Gather Information

Before deploying, collect context by running these commands (in parallel):

1. `clasp deployments` — list existing deployments and their IDs
2. `clasp versions` — list existing versions
3. Check for uncommitted local changes by diffing against remote:
   - Show the user which files exist locally: `ls *.js *.json *.html 2>/dev/null`

## Ask the User

After showing the current state, ask the user:

1. **Push first?** — "Do you have local changes to push before deploying? I can run `clasp push` for you."

**Do not ask for deployment type or description.** Only update the existing deployment. Derive the version description from the change (recent edits, modified files, or a short summary of what was done).

## Deployment Flow (update existing only)

1. Push local code if the user confirmed:
   ```
   clasp push
   ```
2. Redeploy to the existing deployment ID with a description derived from the change:
   ```
   clasp deploy -i AKfycbzhWLFLw6mFVL5_7tNnZjwZT2OQM-dkGREPZnbBxKeaNn9G3k_06oKpOk2TSQzW6xmtOg -d "<description derived from change>"
   ```
3. Confirm success by listing deployments:
   ```
   clasp deployments
   ```

## After Deployment

Tell the user:

- The `@HEAD` deployment always points to the latest pushed code (useful for development/testing).
- The named deployment (fixed ID above) is what the Google Chat app uses in production; same ID after update.
- They can open the script in the browser with `clasp open`.

## Important

- You **can** run `clasp push`, `clasp deploy`, `clasp deployments`, `clasp versions`, and `clasp open`.
- Always confirm with the user before running `clasp push` (it overwrites remote code).
- **Only** update the existing deployment; never create a new deployment (would change the ID and break Chat config).
- Derive the deploy description from the change; do not ask the user for it unless they explicitly want to set it.
- If `clasp push` fails with a manifest error, suggest retrying with `clasp push -f` after confirming with the user.
