# Firebase Quick Reference

## Database Structure

Your app uses the following Firestore collections:

```
users/
  └── {userId}/
      ├── reports/          # User's field service reports
      ├── bibleStudies/     # User's bible studies
      └── goals/            # User's goals
```

## Security Rules

Security rules are defined in `firestore.rules`. They ensure:
- Only authenticated users can access data
- Users can only access their own data (under `users/{userId}/`)

## Quick Commands

### Deploy Firestore Rules

**To Staging (Development):**
```bash
# Replace YOUR_STAGING_PROJECT_ID with your actual staging project ID
firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT_ID
```

**To Production:**
```bash
npm run firebase:deploy-rules:prod
# OR manually:
firebase deploy --only firestore:rules --project reportease-app
```

**To Current Project (default):**
```bash
npm run firebase:deploy-rules
# OR manually:
firebase deploy --only firestore:rules
```

### Initialize Firebase (First Time)

```bash
firebase login
firebase init firestore
```

Select:
- Use existing `firestore.rules`
- Use existing `firestore.indexes.json`

## Environment Files

- **Development**: `src/environments/environment.ts` → Uses staging Firebase
- **Production**: `src/environments/environment.prod.ts` → Uses production Firebase

## Collections Auto-Create

⚠️ **Important**: You don't need to manually create collections! They are created automatically when you add the first document.

## Testing Rules Locally

```bash
firebase emulators:start --only firestore
```

Then test your app against the local emulator.

## Common Issues

### "Permission denied"
- Check rules are deployed: `firebase deploy --only firestore:rules`
- Verify user is authenticated
- Check browser console for specific error

### "Collection not found"
- This is normal! Collections auto-create on first write
- Just use the app and collections will appear

### Rules not updating
- Make sure you deployed: `firebase deploy --only firestore:rules`
- Check you're deploying to the correct project
- Clear browser cache and refresh

### App not updating after switching environments
1. **Clear Browser Cache:**
   - Open DevTools (F12)
   - Application tab > Storage > Clear site data
   - Hard refresh (Ctrl+Shift+R)

2. **Clear IndexedDB:**
   - DevTools > Application > IndexedDB
   - Delete `ReportEaseOfflineDB`
   - Refresh

3. **Unregister Service Worker:**
   - DevTools > Application > Service Workers
   - Click Unregister
   - Refresh

4. **Clear Firestore Cache:**
   - The app uses persistent cache, so switching projects may show old data
   - Clear browser storage completely (see above)
   - Or use incognito/private window for testing
