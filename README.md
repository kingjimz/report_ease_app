# ReportEaseApp

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.1.3.

## Firebase Environment Configuration

This app uses separate Firebase configurations for development and production:

- **Development/Staging**: Uses `src/environments/environment.ts` (used when running `ng serve`)
- **Production**: Uses `src/environments/environment.prod.ts` (used when building with `ng build --configuration=production`)

### Setting Up Staging Firebase

1. Create a new Firebase project in the [Firebase Console](https://console.firebase.google.com/) for staging/development
2. Get your Firebase configuration from Project Settings > General > Your apps
3. Update `src/environments/environment.ts` with your staging Firebase credentials:
   - Replace `YOUR_STAGING_API_KEY` with your staging API key
   - Replace `YOUR_STAGING_PROJECT` with your staging project domain
   - Replace `YOUR_STAGING_PROJECT_ID` with your staging project ID
   - Replace `YOUR_STAGING_MESSAGING_SENDER_ID` with your staging messaging sender ID
   - Replace `YOUR_STAGING_APP_ID` with your staging app ID
   - Replace `YOUR_STAGING_MEASUREMENT_ID` with your staging measurement ID (optional)

**Important**: Never commit production Firebase credentials to version control. Consider using environment variables or a secrets management system for sensitive credentials.

### Quick Setup

For detailed setup instructions, see **[FIREBASE_SETUP_GUIDE.md](./FIREBASE_SETUP_GUIDE.md)**.

For quick commands and reference, see **[FIREBASE_QUICK_REFERENCE.md](./FIREBASE_QUICK_REFERENCE.md)**.

### Firestore Security Rules

Security rules are defined in `firestore.rules`. Deploy them to your staging project:

```bash
# Deploy to staging (replace with your staging project ID)
firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT_ID

# Deploy to production
npm run firebase:deploy-rules:prod
```

**Note**: The dev server uses the staging Firebase configuration from `environment.ts`.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
