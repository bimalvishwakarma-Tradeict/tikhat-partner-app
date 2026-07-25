# Mobile App Build Guide — Tikhat Partner

Build and distribute the Tikhat Partner mobile app with **Expo EAS Build**.

| Platform | Package / Bundle ID |
|----------|---------------------|
| Android | `online.tikhatpartner.app` |
| iOS | `online.tikhatpartner.app` |

App version (user-facing): **1.0.0**  
Android `versionCode`: **1** · iOS `buildNumber`: **"1"**

---

## Prerequisites

1. Node.js 20 LTS
2. Expo account — [https://expo.dev/signup](https://expo.dev/signup)
3. EAS CLI:

```bash
npm install -g eas-cli
eas login
```

4. From `frontend/`:

```bash
cd frontend
npm install
```

5. Link the project to EAS (one-time):

```bash
cd frontend
eas init
```

Copy the generated `projectId` into `app.json` → `expo.extra.eas.projectId` (replace `replace-with-eas-project-id`).

6. Set API URL for builds (already in `eas.json` profiles):

```text
EXPO_PUBLIC_API_URL=https://tikhatpartner.online/api/v1
```

Override per build if needed:

```bash
EXPO_PUBLIC_API_URL=https://staging.example.com/api/v1 eas build -p android --profile preview
```

---

## Placeholder assets

Located in `frontend/assets/` (replace before store release):

| File | Use |
|------|-----|
| `icon.png` | App icon (1024×1024) |
| `adaptive-icon.png` | Android adaptive foreground (1024×1024) |
| `splash.png` | Splash screen |
| `favicon.png` | Web favicon |

Brand colors used: primary `#0A1628`, accent `#C9A84C`.

---

## EAS profiles (`frontend/eas.json`)

| Profile | Purpose | Android output | iOS output |
|---------|---------|----------------|------------|
| **development** | Dev client / local debugging | APK (debug) | Simulator build |
| **preview** | Internal QA / device testing | **APK** | IPA (ad hoc / internal) |
| **production** | Store release | **AAB** (Play Store) | IPA (App Store) |

---

## Android builds

### Preview APK (testing)

```bash
cd frontend
eas build --platform android --profile preview
```

When the build finishes:

1. Open the Expo build page URL printed in the terminal
2. Download the **APK**
3. Transfer to an Android device and install (allow “Install unknown apps” if prompted)
4. Open **Tikhat Partner** and confirm login / API connectivity

### Production AAB (Play Store)

```bash
cd frontend
eas build --platform android --profile production
```

Submit to Google Play (draft / internal track):

```bash
eas submit --platform android --profile production --latest
```

You will need a Google Play Console app + service account JSON for automated submit (see Expo submit docs).

### Development client

```bash
eas build --platform android --profile development
```

Install the APK, then run:

```bash
npx expo start --dev-client
```

---

## iOS builds (Apple Developer account required)

Apple Developer Program enrollment is required for device IPAs and App Store distribution.

### Preview IPA (TestFlight / ad hoc)

```bash
cd frontend
eas build --platform ios --profile preview
```

First run will prompt for Apple credentials / create distribution certificates and provisioning profiles via EAS.

### Production IPA (App Store)

```bash
cd frontend
eas build --platform ios --profile production
```

Submit:

```bash
eas submit --platform ios --profile production --latest
```

Update `eas.json` → `submit.production.ios`:

- `ascAppId` — App Store Connect app id
- `appleTeamId` — Apple Developer Team ID

### Simulator (development only)

```bash
eas build --platform ios --profile development
```

---

## Versioning

Configured in `frontend/app.json`:

```json
"version": "1.0.0",
"ios": { "buildNumber": "1" },
"android": { "versionCode": 1 }
```

Production profile uses `"autoIncrement": true` so EAS bumps native build numbers on each production build.

Before a store release, bump the user-facing `version` (e.g. `1.0.1`, `1.1.0`) in `app.json`.

---

## Both platforms

```bash
eas build --platform all --profile preview
eas build --platform all --profile production
```

---

## Local checks before cloud build

```bash
cd frontend
npx expo-doctor
npx expo config --type public
```

Confirm:

- `ios.bundleIdentifier` = `online.tikhatpartner.app`
- `android.package` = `online.tikhatpartner.app`
- Icon / splash paths resolve under `./assets/`

---

## Distribution summary

| Audience | Command | Artifact |
|----------|---------|----------|
| QA / stakeholders (Android) | `eas build -p android --profile preview` | APK |
| Play Store | `eas build -p android --profile production` | AAB |
| TestFlight / internal iOS | `eas build -p ios --profile preview` | IPA |
| App Store | `eas build -p ios --profile production` | IPA |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `projectId` missing | Run `eas init` and update `app.json` |
| API calls fail on device | Confirm `EXPO_PUBLIC_API_URL` and CORS / Cloudflare allow mobile |
| Android install blocked | Enable install from unknown sources / use internal Play track |
| iOS credentials errors | Run `eas credentials` and follow Apple prompts |
| Icon/splash wrong | Replace files in `frontend/assets/` (keep filenames) and rebuild |

---

## Related files

| File | Role |
|------|------|
| `frontend/eas.json` | EAS build & submit profiles |
| `frontend/app.json` | App identity, version, icons, splash |
| `frontend/app.config.ts` | Env injection (`EXPO_PUBLIC_API_URL`) |
| `frontend/assets/*` | Icon / splash placeholders |
| `MOBILE_BUILD.md` | This guide |
