# Firebase Staging Setup Guide

This guide will help you quickly set up your staging Firebase project with the same structure and rules as production.

## Quick Setup Steps

### 1. Create Staging Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Name it something like `reportease-app-staging` or `reportease-app-dev`
4. Follow the setup wizard (you can skip Google Analytics for staging if you want)

### 2. Enable Required Services

#### Enable Authentication
1. In Firebase Console, go to **Authentication** > **Get started**
2. Enable **Email/Password** sign-in method
3. (Optional) Enable other sign-in methods you use in production

#### Enable Firestore Database
1. Go to **Firestore Database** > **Create database**
2. Choose **Start in test mode** (we'll update rules in step 4)
3. Select a location (preferably the same as production)
4. Click **Enable**

### 3. Get Firebase Configuration

1. Go to **Project Settings** (gear icon) > **General** tab
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app (name it "ReportEase Staging" or similar)
5. Copy the Firebase configuration object
6. Update `src/environments/environment.ts` with these values:
   ```typescript
   firebase: {
     apiKey: 'YOUR_STAGING_API_KEY',
     authDomain: 'YOUR_STAGING_PROJECT.firebaseapp.com',
     projectId: 'YOUR_STAGING_PROJECT_ID',
     storageBucket: 'YOUR_STAGING_PROJECT.firebasestorage.app',
     messagingSenderId: 'YOUR_STAGING_MESSAGING_SENDER_ID',
     appId: 'YOUR_STAGING_APP_ID',
     measurementId: 'YOUR_STAGING_MEASUREMENT_ID', // Optional
   }
   ```

### 4. Deploy Firestore Security Rules

#### Option A: Using Firebase CLI (Recommended)

1. Install Firebase CLI if you haven't:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project (if not already done):
   ```bash
   firebase init firestore
   ```
   - Select your staging project
   - Use existing `firestore.rules` file
   - Use existing `firestore.indexes.json` file

4. Deploy rules to staging:
   ```bash
   firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT_ID
   ```

#### Option B: Using Firebase Console (Manual)

1. Go to **Firestore Database** > **Rules** tab
2. Copy the contents of `firestore.rules` from this project
3. Paste into the rules editor
4. Click **Publish**

### 5. Database Structure

Your Firestore database uses the following structure:

```
users/
  └── {userId}/
      ├── reports/
      │   └── {reportId}
      ├── bibleStudies/
      │   └── {studyId}
      └── goals/
          └── {goalId}
```

**Note**: Collections are created automatically when you add data. You don't need to manually create them.

### 6. Test Your Setup

1. Start your development server:
   ```bash
   ng serve
   ```

2. The app should connect to your staging Firebase project
3. Try creating a test account and adding some data
4. Verify data appears in Firestore Console under `users/{userId}/reports`, etc.

## Security Rules Explanation

The security rules in `firestore.rules` ensure:
- ✅ Only authenticated users can access data
- ✅ Users can only read/write their own data
- ✅ Each user's data is isolated under `users/{userId}/`

## Copying Production Data to Staging (Optional)

If you want to copy some production data to staging for testing:

### Using Firebase Console:
1. Export data from production Firestore
2. Import it into staging Firestore

### Using Firebase CLI:
```bash
# Export from production
firebase firestore:export gs://YOUR_BUCKET/prod-export --project YOUR_PROD_PROJECT_ID

# Import to staging
firebase firestore:import gs://YOUR_BUCKET/prod-export --project YOUR_STAGING_PROJECT_ID
```

## Switching Between Environments

- **Development**: Uses `environment.ts` (staging Firebase)
  - Run: `ng serve` (defaults to development)
  
- **Production**: Uses `environment.prod.ts` (production Firebase)
  - Build: `ng build --configuration=production`

## Troubleshooting

### "Permission denied" errors
- Check that Firestore rules are deployed correctly
- Verify authentication is enabled
- Ensure user is logged in

### "Collection not found" errors
- This is normal! Collections are created automatically when you add the first document
- Just start using the app and collections will be created

### Can't connect to Firebase
- Verify your Firebase config in `environment.ts`
- Check that all required services (Auth, Firestore) are enabled
- Check browser console for specific error messages

### App not updating after switching to staging
- Clear browser cache and IndexedDB (see troubleshooting section below)
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Unregister service worker if enabled
- Clear browser storage: DevTools > Application > Storage > Clear site data

## Clearing Cache When Switching Environments

When switching between staging and production, you may need to clear cached data:

### Clear Browser Storage
1. Open DevTools (F12)
2. Go to **Application** tab
3. Under **Storage**, click **Clear site data**
4. Refresh the page

### Clear IndexedDB
1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB**
4. Right-click on `ReportEaseOfflineDB` and select **Delete**
5. Refresh the page

### Unregister Service Worker
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers**
4. Click **Unregister** next to any registered workers
5. Refresh the page

## Next Steps

1. ✅ Create staging Firebase project
2. ✅ Enable Authentication and Firestore
3. ✅ Update `environment.ts` with staging credentials
4. ✅ Deploy security rules
5. ✅ Test the app in development mode

Your staging environment is now ready! 🎉
