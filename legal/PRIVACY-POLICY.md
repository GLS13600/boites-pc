# Privacy Policy — Unydex

**Last updated: 2 October 2026.**

Unydex is a personal collection tracker. This policy states exactly what it does with
your data — and, above all, everything it does not do.

> The French version, [POLITIQUE-CONFIDENTIALITE.md](POLITIQUE-CONFIDENTIALITE.md),
> is the reference text. This translation is provided for App Review and for users
> outside France.

---

## In short

- **Without an account, nothing leaves your device.** No network request, no data
  sent, no analytics. The app works entirely offline.
- **The account is optional.** It only serves to find your collection again on
  another device and to keep it safe from a reinstall.
- **No advertising, no trackers, no analytics**, in the app or on the website.
- **No data is sold, rented or passed to third parties** for commercial purposes.
- **The camera transmits nothing.** Recognition runs on your phone.
- **You can delete everything from inside the app**, immediately and permanently.

---

## 1. Who is responsible

The data controller is:

- **Name**: *[to be completed]*
- **Address**: *[to be completed]*
- **Contact**: *[to be completed]*

---

## 2. What the app does WITHOUT an account

Nothing leaves the device.

Your progress — caught Pokémon, boxes, box names and wallpapers, teams, preferences —
is stored **only in the app's local storage**. Nobody but you reads it, and it
disappears if you uninstall the app without exporting it first.

All game data (sprites, descriptions, locations, moves, sounds) is **bundled inside
the app**: it queries no server to display them.

### The camera

The Scan view uses the rear camera to recognise what you point it at.

- Analysis happens **entirely on your phone**, through a neural network embedded in
  the app.
- **No image is ever sent anywhere.** None is stored: frames are analysed and
  discarded on the fly.
- Camera access is requested by iOS and can be refused or revoked at any time in the
  phone's settings; the rest of the app keeps working.

---

## 3. What the app does WITH an account

Creating an account is a choice. As long as you don't, the section above describes
everything that happens.

### 3.1. Data processed

| Data | Why | Where it comes from |
|---|---|---|
| **Email address** | Identify your account, confirm sign-up, reset your password | You, or your Google / Apple account |
| **Password** | Sign you in. It is **hashed** (bcrypt): never stored or readable in clear text | You |
| **Internal identifier** (UUID) | Link your profile and collection to your account | Generated automatically |
| **Username** | Identify you inside the app | You, or derived from your email / Google name at sign-up |
| **Profile picture** | Display it. It is **a Pokémon number**, not an image: nothing is uploaded | You |
| **Your collection** | Find it again on another device: caught Pokémon, boxes, order, teams, and preferences (game, view, theme, language) | Your use of the app |
| **Device type** | So we can tell you "saved from iPhone" when two devices disagree. It is the **type** ("iPhone" or "Browser"), never an identifier or a device name | Derived |
| **Last upload time** | Know which of two collections is the more recent | Automatic |

If you sign in with **Google** or **Apple**, the provider passes your email address
and, where applicable, your name — nothing else. Unydex requests no other access to
your Google or Apple account: no contacts, no calendar, no files. With Apple you may
choose to **hide your address**: the app will only ever see an alias.

### 3.2. What is NEVER collected

No location, address book, calendar, photos, microphone, health data, advertising
identifier, browsing history, list of installed apps, or payment data. The app has no
in-app purchases.

### 3.3. No advertising tracking

No data is used to track you across other apps or websites. There is **no ad network,
no analytics SDK, no pixel**. Under Apple's App Tracking Transparency framework,
Unydex **does not track**.

---

## 4. Legal basis

| Processing | Legal basis (GDPR) |
|---|---|
| Creating and keeping the account, signing in | **Performance of a contract** (Art. 6(1)(b)): it is the service you asked for |
| Backing up and restoring the collection | **Performance of a contract** (Art. 6(1)(b)) |
| Host's technical logs, abuse prevention | **Legitimate interests** (Art. 6(1)(f)): keeping the service up and safe |

Consent is deliberately not the basis used: the account is optional, and the data
processed is **strictly what is needed** to deliver the service requested. Not
creating an account is the way to transmit nothing.

---

## 5. Who hosts it, and where

Account data is hosted by **Supabase** (Supabase, Inc.), acting as a processor within
the meaning of Article 28 GDPR.

- Project region: *[to be completed]*.
- Supabase publishes a [Data Processing Addendum](https://supabase.com/legal/customer-resources/data-processing-addendum)
  and a [sub-processor list](https://supabase.com/legal/customer-resources/subprocessor-list).
- If the region is **outside the European Union**, the transfer is covered by the
  European Commission's **Standard Contractual Clauses**, incorporated into that
  addendum.

The host keeps **technical logs** (IP addresses, request timestamps) for a short
period, for security and diagnostics. Unydex does not consult them and builds no
profile from them.

The site `gls13600.github.io` is served by **GitHub Pages** (GitHub, Inc.), which
keeps its own access logs.

---

## 6. How long

- **Account and collection**: kept as long as the account exists. Erased
  **immediately** when it is deleted.
- **Local data on the device**: as long as the app is installed. Uninstalling erases
  it.
- **Host logs**: a few days, per Supabase's policy.

There is **no "just in case" retention** after an account is deleted, and no parallel
backup kept on our side.

---

## 7. Your rights

You have the rights of **access**, **rectification**, **erasure**, **restriction**,
**objection** and **portability** (GDPR, Art. 15–22). In practice, inside the app:

| Right | How to exercise it |
|---|---|
| **Access and portability** | Settings → Backup → **Export all my data**. You get a readable, complete JSON file, immediately, without asking anyone |
| **Rectification** | Settings → Account: username and picture can be changed in place |
| **Erasure** | Settings → Account → **Delete my account**. Immediate and permanent: account, profile and server-side collection go together |
| **Objection, restriction** | Write to the contact address above |

Deleting the account **does not touch** your local collection: it stays on your phone,
and the app keeps working without an account.

You may lodge a complaint with your national supervisory authority — in France, the
**CNIL** ([cnil.fr](https://www.cnil.fr)).

---

## 8. Security

- All communication uses **HTTPS**.
- Passwords are **hashed** by Supabase; they are neither stored nor viewable in clear
  text.
- Data access is enforced in the database itself through **row level security**:
  technically, an account can only read and write its own rows. The public key
  embedded in the app grants nothing by itself.
- Profiles (username and picture) are readable by authenticated accounts: that is what
  allows "this username is already taken". **Neither email addresses nor collections
  are.**

No system is infallible. In the event of a data breach presenting a risk, you would be
informed in accordance with Article 34 GDPR.

---

## 9. Minimum age

Accounts are restricted to people **aged 16 or over**. Below that, the app remains
fully usable **without an account**: every feature works locally.

Unydex is not directed at children and knowingly collects no data from anyone under
16. If you believe such an account was created, write to the contact address and it
will be deleted.

---

## 10. Changes

This policy may change. The date at the top marks the latest version. A significant
change will be announced in the app. The full history of changes is public in the
source repository.

---

## 11. Contact

*[to be completed]*
