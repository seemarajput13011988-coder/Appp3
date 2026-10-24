# K&B Workforce 2.0 — Phase 1 starter

This is a **working UI/authentication prototype**, not a production workforce tracker. It has responsive employee/admin interfaces, Firebase employee login, browser-local admin credential checks, role checks, admin task assignment, task viewing, and shift start/end event recording. It does NOT provide location tracking, offline sync, chat, payroll, or exports.

## Setup
1. Back up your existing Firebase Realtime Database and deployed HTML files.
2. Enable **Firebase Authentication > Email/Password** in Firebase Console for employees. Employee accounts stay signed in on their device until they sign out.
3. The admin portal starts with username `admin` and password `admin123`. Use **Admin credentials** in the portal to change them; changes are saved in that browser only. The defaults and localStorage credentials are visible to anyone who can inspect the static site or browser profile. This is a convenience gate, not secure authentication; change the defaults for casual privacy, but do not use it to protect sensitive data.
4. Employee account creation and role assignment must be done by an administrator in Firebase Console or a trusted server. Using trusted Firebase Console access, create `/profiles/<AUTH_UID>` entries, e.g. `{ "role": "employee", "name": "Technician A", "team": "Team Alpha" }`. **Never allow clients to assign their own roles.**
5. Review `database.rules.json` against your existing database paths. **Do not blindly overwrite production rules:** these rules deny legacy paths and may interrupt your current site. Test in a separate Firebase test project first.
6. Host this folder through Netlify or a local web server (ES modules cannot reliably load from `file://`). The existing Firebase project is configured in `firebase.js`; ensure your deployed domain is in Firebase Authentication authorized domains.
7. The admin database features still require trusted admin authorization because Firebase rules deny unauthenticated admin reads and writes. A server-side endpoint or Firebase admin identity is required to enable them with local admin sign-in. Do not loosen database rules to public access. Test employee features with an employee account.

## Important limitations
- Shift start and end events use server timestamps and database rules restrict edits to the signed-in employee. The starter rules do not enforce unique active shifts; a trusted backend is needed for strong concurrency guarantees.
- Starting a shift records a server timestamp, but this prototype does not prevent multiple active shifts. Implement server-side uniqueness and business-hours enforcement before real attendance use.
- Browser location tracking is NOT implemented; reliable Android background tracking requires a native app and explicit employee consent.
- The role checks in UI are supplemental; database rules provide authorization. For production, use server-managed custom claims and trusted backend validation, plus rate limits, audit trails, and stronger input validation.
- Firebase web config is not a password. Do not embed service account credentials in these files.
- This is a new data model (`profiles`, `tasks`, `shifts`) and does not automatically migrate old `workers`/`attendance` data.
- Tailwind CDN is used for ease of preview; bundle Tailwind for production.
