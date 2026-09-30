# M365C Study

A study app for M365C (Real Analysis). It runs in Safari, installs to the home screen, and works offline.

## Put it online (free, from your phone)
1. Unzip this file in the Files app (tap it once).
2. On github.com (Safari), create a **public** repository, e.g. `analysis-study`. If a button is missing, use Safari's aA menu → Request Desktop Website.
3. In the repository: **Add file → Upload files**, select every file from the unzipped folder, then **Commit changes**. All files sit at the top level; there are no folders.
4. **Settings → Pages → Deploy from a branch → main / (root) → Save.**
5. After a minute or two the app is at `https://YOUR-USERNAME.github.io/analysis-study/`.
6. Open that link in **Safari** → Share → **Add to Home Screen**.

## Adding a new lecture pack
Claude sends a `pack-….json` file and an updated `packs.json`. Upload both (replace `packs.json`) and commit. In the app: More → Check for new packs.
You can also skip GitHub for a single pack: More → Import pack file.

## Updating the app itself
Upload the new files over the old ones. When `app.js` or `style.css` change, `sw.js` gets a new cache name so phones pick up the update on the next launch (close and reopen the app).

## Notes
- Progress lives only on each phone. Use More → Save backup file now and then.
- This repository is public. Don't upload textbook PDFs or lecture notes here.
