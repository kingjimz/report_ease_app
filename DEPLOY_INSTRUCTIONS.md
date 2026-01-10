# Netlify Deployment Instructions

## Important: Which Folder to Deploy

When you build the app, the deployable files are in:
```
dist/report_ease_app/browser/browser/
```

**You must drag and drop the INNER `browser` folder**, not the outer one.

## Steps:

1. **Build the app:**
   ```bash
   npm run build -- --configuration production
   ```

2. **Navigate to the build output:**
   - Go to: `dist/report_ease_app/browser/browser/`
   - This folder contains: `index.html`, `_redirects`, and all other files

3. **Deploy to Netlify:**
   - Drag and drop the **`browser`** folder (the one inside `dist/report_ease_app/browser/browser/`)
   - Make sure the `_redirects` file is in the root of what you're dragging

## Verify Before Deploying:

The folder you drag should contain:
- ✅ `index.html`
- ✅ `_redirects` (this file prevents 404 errors)
- ✅ `main-*.js`
- ✅ `styles-*.css`
- ✅ `ngsw-worker.js`
- ✅ `assets/` folder
- ✅ `netlify.toml` (optional, but helpful)

## Alternative: Use Netlify CLI

If you prefer using the CLI:
```bash
netlify deploy --dir=dist/report_ease_app/browser/browser --prod
```

