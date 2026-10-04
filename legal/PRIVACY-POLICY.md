# Privacy Policy

**Version 1.0 — Effective 4 October 2026**

## Preamble

This policy informs users of the Unydex application (the "Application") of the
processing of personal data carried out by the publisher, in accordance with Articles
12 to 14 of Regulation (EU) 2016/679 of 27 April 2016 (the "GDPR") and with French Act
No. 78-17 of 6 January 1978, as amended.

It forms an integral part of the [Terms of Use](CONDITIONS-UTILISATION.md).

> The French version, [POLITIQUE-CONFIDENTIALITE.md](POLITIQUE-CONFIDENTIALITE.md),
> is the authoritative text. This translation is provided for information purposes.
> In the event of any discrepancy, the French version prevails.

**Summary.** The Application works entirely offline. Where no account is created,
**no data leaves the user's device**: no network request is issued. Creating an
account is optional and serves only to let the user recover their collection on
another device. The Application contains **no advertising, no trackers and no
analytics**. No data is sold, rented or disclosed to third parties for commercial
purposes.

---

## Article 1 — Data controller

The controller, within the meaning of Article 4(7) GDPR, is:

- **Name**: [FULL NAME OR COMPANY NAME]
- **Address**: [FULL POSTAL ADDRESS]
- **Email**: [CONTACT EMAIL ADDRESS]

The appointment of a data protection officer is not required under Article 37 GDPR:
the processing carried out involves neither regular and systematic monitoring on a
large scale, nor large-scale processing of data falling within Article 9 GDPR.

---

## Article 2 — Processing where no account is created

Where no account is created, the user's progress — saved entries, box organisation and
customisation, teams, display preferences — is stored **solely in the Application's
local storage** on the device. This information is transmitted to no recipient and is
subject to no processing by the controller.

All descriptive information displayed by the Application is embedded within it. No
request is made to any third-party server in order to display it.

### 2.1. Camera-based recognition feature

The Application includes an image-recognition feature using the device's rear camera.

- Image processing is **performed entirely on the device**, by means of a machine
  learning model embedded in the Application.
- **No image is transmitted to any server, to the publisher or to any third party. No
  image is stored**: frames are analysed and immediately discarded.
- Camera access is subject to an operating-system permission request. It may be
  refused or revoked at any time in the device settings, with no effect on the rest of
  the Application.

---

## Article 3 — Data processed where an account is created

### 3.1. Categories of data

- **Identification data** — email address; password, stored as a hash (bcrypt) and
  never accessible in clear text; internal identifier (UUID). *Source: the user, or
  their identity provider.*
- **Profile data** — username; profile picture, consisting of a **numeric identifier**
  and not of an image file; creation and modification dates. *Source: the user, or
  derived on sign-up.*
- **Collection** — saved entries, box organisation and customisation, display order,
  teams, usage preferences (game version, display mode, theme, language). *Source: use
  of the Application.*
- **Technical data** — date of last upload; **type** of originating device ("iPhone" or
  "Browser"), excluding any device identifier or device name. *Source: automatic.*

### 3.2. Sign-in through an identity provider

Where the user chooses to sign in using a Google or Apple account, the identity
provider discloses to the controller **the email address and, where applicable, the
name** associated with that account, and nothing else. No other access to the
provider's account is requested: not to contacts, calendar, files or messages.

Apple's authentication service allows the user to **hide their email address**; in
that case the controller only ever receives a relay address.

Sign-in with the identity provider takes place directly between the user and that
provider. Processing carried out by the provider on that occasion is governed by its
own privacy policy.

### 3.3. Data not collected

No collection is made of: location data, address book, calendar, photo library,
microphone, health data, advertising identifiers, browsing history, list of installed
applications, or payment data. The Application contains no in-app purchases.

### 3.4. No profiling or automated decision-making

No profiling within the meaning of Article 4(4) GDPR is carried out. No decision
producing legal effects concerning the user or significantly affecting them is taken
on the basis of automated processing, within the meaning of Article 22 GDPR.

### 3.5. No marketing

The data collected is not used for any marketing purpose. No advertising message or
newsletter is sent to the user.

### 3.6. No advertising tracking

No data is combined with data held by third parties, disclosed to a data broker, or
used for targeted advertising. The Application carries out no tracking within the
meaning of Apple's App Tracking Transparency framework and accordingly requests no
permission in that respect.

---

## Article 4 — Purposes and legal bases

| Purpose | Legal basis |
|---|---|
| Creating, managing and authenticating the account | Performance of a contract — Art. 6(1)(b) GDPR |
| Storing and restoring the collection on another device | Performance of a contract — Art. 6(1)(b) GDPR |
| Checking the availability of a username | Performance of a contract — Art. 6(1)(b) GDPR |
| System security, technical logging, abuse prevention | Legitimate interests — Art. 6(1)(f) GDPR |
| Compliance with the controller's legal obligations | Legal obligation — Art. 6(1)(c) GDPR |

Consent is not relied upon as a legal basis: creating an account is optional, and the
only data processed is that necessary to provide the service expressly requested. A
user who does not create an account transmits no data.

**Mandatory nature of the data.** The data referred to in Article 3.1 is necessary for
the creation and operation of the account. Failure to provide it means the user cannot
benefit from the online features; the Application remains fully usable without an
account.

---

## Article 5 — Recipients and processors

The data is intended for the controller alone and, strictly for the purposes of
performing their services, for the following processors:

- **Supabase, Inc.** — database hosting and authentication service. Safeguards: data
  processing addendum and public list of sub-processors; European Commission standard
  contractual clauses.
- **GitHub, Inc.** — hosting of the website and application files. Safeguards: GitHub
  data protection addendum.
- **Apple Inc.** — application distribution and, where applicable, authentication
  service. Safeguards: Apple Media Services Terms and Conditions.

Each processor acts on the controller's documented instructions, under the conditions
of Article 28 GDPR.

Data may further be disclosed to any competent administrative or judicial authority
making a request under the conditions provided for by law.

**No data is sold, rented or exchanged for commercial purposes.**

---

## Article 6 — Transfers outside the European Union

Account data is hosted in the **[PROJECT REGION]** region.

Where the hosting region is located outside the European Union, or where a
sub-processor is established outside the Union, the transfer is governed by the
**standard contractual clauses** adopted by the European Commission under Article
46(2)(c) GDPR, incorporated into the relevant processor's data processing addendum,
together with supplementary technical measures where appropriate.

A copy of the applicable safeguards may be obtained on request to the controller.

---

## Article 7 — Retention periods

| Data | Period |
|---|---|
| Account, profile and collection stored on the servers | Until the user deletes the account. Erasure is immediate and cascading |
| Data stored on the device | Until the Application is uninstalled, or its data erased by the user |
| Hosts' technical logs | Period set by each host, in the order of a few days |

No intermediate archiving is carried out after an account is deleted, and no copy is
retained by the controller, save for the hosts' technical backups, whose rotation
results in erasure within the periods stated above.

---

## Article 8 — Security

The controller implements appropriate technical and organisational measures within the
meaning of Article 32 GDPR, in particular:

- encryption of all communications (HTTPS);
- storage of passwords as hashes, precluding any retrieval in clear text;
- partitioning enforced **at database level** (row level security), ensuring that an
  account can read and write only its own records;
- the absence of any privilege attached to the public key embedded in the Application,
  which by itself grants no access to data;
- restriction of elevated-privilege functions and pinning of their search path.

The username and profile picture are accessible to authenticated accounts, which is
what allows the Application to indicate that a username is already taken. **Neither
email addresses nor collections are accessible to other users.**

As no system is immune to failure, the controller undertakes, in the event of a
personal data breach likely to result in a high risk to the rights and freedoms of
data subjects, to inform them under the conditions of Article 34 GDPR, and to notify
the breach to the supervisory authority under the conditions of Article 33.

---

## Article 9 — Rights of data subjects

The user has, under the conditions and within the limits laid down by the GDPR, the
following rights: **access** (Art. 15), **rectification** (Art. 16), **erasure**
(Art. 17), **restriction of processing** (Art. 18), **portability** (Art. 20) and
**objection** (Art. 21). The user may also issue **directives concerning the fate of
their data after death**, pursuant to Article 85 of French Act No. 78-17 of 6 January
1978, as amended.

### 9.1. Exercising rights within the Application

| Right | How |
|---|---|
| Access and portability | Settings → Backup → "Export all my data". A complete, readable and structured file is provided immediately, with no formality |
| Rectification | Settings → Account: the username and profile picture can be changed directly |
| Erasure | Settings → Account → "Delete my account". Erasure of the account, profile and server-side collection is immediate and permanent |

Deleting the account has no effect on the collection stored on the device, which
remains accessible offline.

### 9.2. Exercising rights with the controller

Other rights are exercised by request to the email address given in Article 1,
accompanied by any evidence establishing the requester's identity where there is
reasonable doubt. A reply is provided within one month of receipt of the request,
extendable by two months where the request is complex, in which case the user is
informed of the extension and of the reasons for it.

### 9.3. Complaints

A user who considers, having contacted the controller, that their rights are not being
respected may lodge a complaint with the French supervisory authority, the
**Commission nationale de l'informatique et des libertés** (CNIL), 3 place de
Fontenoy, TSA 80715, 75334 Paris Cedex 07, France —
[www.cnil.fr](https://www.cnil.fr), or with the supervisory authority of their Member
State of habitual residence.

---

## Article 10 — Minors

Account creation is restricted to persons aged **sixteen (16) years or over**, or the
lower age set by the applicable national legislation pursuant to Article 8(1) GDPR —
fifteen (15) years in France, pursuant to Article 7-1 of French Act No. 78-17 of
6 January 1978, as amended.

Below that age, the Application remains **fully usable without an account**: all of
its features run locally, with no transmission of data.

The Application is not directed at children and knowingly collects no data concerning
them. A holder of parental authority who finds that an account has been created in
breach of this Article may request its erasure at the address given in Article 1; it
is carried out without delay.

---

## Article 11 — Amendments to this policy

This policy may change, in particular where processing operations or the applicable
regulations evolve. The applicable version is the one published at the addresses
referred to within the Application. Any substantial amendment is brought to the user's
attention by appropriate means within the Application.

The history of successive versions is public and may be consulted in the source code
repository.

---

## Article 12 — Contact

Any question relating to this policy may be addressed to the controller at the address
given in Article 1.
