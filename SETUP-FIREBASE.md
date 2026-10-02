# Setting up the shared family log (Firebase)

This takes about 10 minutes, once. Firebase's free plan covers this easily, no credit card needed.
You sign in to Firebase with your normal Google account.

## 1. Create the project
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Get started**). Name it `twin-track`.
3. When asked about Google Analytics (and Gemini), turn them **off**. They aren't needed.
4. Click **Create project**, wait, then **Continue**.

## 2. Register the web app (this gives you the config)
1. On the project's home page, click the **`</>`** (Web) icon. It's under "Get started by adding Firebase to your app", or under **Add app**.
2. Nickname: `Twin Track`. Leave **Firebase Hosting** unchecked. Click **Register app**.
3. You'll see a code block containing `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }`.
   **Copy that `firebaseConfig` part and send it to Claude** (or paste it into `firebase-config.js`).
   It isn't a password. It only identifies the project, and the security rules below control access.
4. Click **Continue to console**.

## 3. Turn on Google sign-in
1. In the left menu: **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, choose **Google**, flip **Enable**, pick your email as the support email, and click **Save**.
3. Open the **Settings** tab → **Authorized domains** → **Add domain**, enter `iofreqinmo.github.io`, and click **Add**.

## 4. Create the database
1. Left menu: **Build → Firestore Database → Create database**.
2. If asked for an edition, choose **Standard**. Pick a location near you (for example `nam5 (United States)`). It can't be changed later.
3. Choose **Start in production mode** and click **Create**.

## 5. Lock it to your family
1. Still in Firestore, open the **Rules** tab.
2. Replace everything there with the contents of [`firestore.rules`](firestore.rules), with your family's Gmail addresses in the list.
3. Click **Publish**.

To add someone later, add their email to the list, publish again, and update `firestore.rules` here to match.

## 6. Use it
Open the app and tap **Sign in with Google**. The first time each phone signs in, any entries it logged on its own are uploaded to the shared log.
From then on, everyone signed in sees the same entries within a second or two. Entries logged with no signal are saved on the phone and upload when it reconnects.

### If sign-in doesn't work from the home-screen app
Some iPhones block the Google sign-in window inside home-screen apps. If that happens, delete the home-screen icon, sign in once in Safari, and then re-add it to the home screen from Safari.
