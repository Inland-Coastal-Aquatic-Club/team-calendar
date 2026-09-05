# ICAC Swim Team Practice Schedule Automation

Automated pipeline to parse the weekly coach schedule email and update the live practice schedule on [icacswim.com](https://www.icacswim.com) (TeamUnify / GoMotion) using Playwright and GitHub Actions.

---

## 🌟 How It Works

1. **Email Parsing** ([`scripts/parse_schedule.js`](file:///workspaces/team-calendar/scripts/parse_schedule.js)):
   - Identifies the target practice week (e.g. `August 24th - 29th` or `August 31st - September 5th`).
   - Extracts all group practices (`Black`, `Teal`, `Age Group 1/2/3`, `Senior 1/2`).
   - Detects cancellations (e.g., `NO SWIM PRACTICE FOR ALL GROUPS` due to water polo games or holidays).
   - Identifies special events (e.g., Drylands, morning Senior practices, Saturday Age Group).
   - Generates a structured execution plan mapping out recurring series extensions and single-occurrence cancellations.

2. **Browser Automation** ([`scripts/update_schedule.js`](file:///workspaces/team-calendar/scripts/update_schedule.js)):
   - Authenticates into TeamUnify Back Office.
   - Accesses the Practices calendar using resilient dynamic frame selectors.
   - Extends recurring series (`B`, `T`, `AG1/2/3`, `SR1/2`) to the target week-ending Saturday.
   - Deletes single-instance occurrences on days with full or group-specific cancellations.
   - Saves screenshots at each milestone into `./screenshots/` (uploaded to GitHub Actions on every run).

3. **CI / Triggering** ([`.github/workflows/update-schedule.yml`](file:///workspaces/team-calendar/.github/workflows/update-schedule.yml)):
   - Can be triggered manually via GitHub Actions **Run workflow** (paste email directly).
   - Can be triggered via a **GitHub Issue** labeled `schedule-update` with the email in the issue body.
   - Supports a `dry_run` flag to test without saving modifications.

---

## 🔐 Required GitHub Secrets

In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions** and add:

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `TEAMUNIFY_USER` | TeamUnify admin account email | `chris@icacswim.com` |
| `TEAMUNIFY_PASS` | TeamUnify admin password | `YourPasswordHere` |

---

## 🚀 How to Run the Automation

### Method 1: GitHub Actions UI (Recommended)
1. Go to the **Actions** tab in your GitHub repository.
2. Select **Update Schedule From Email** from the left sidebar.
3. Click **Run workflow**.
4. Paste Coach Scott's email body into the text box.
5. *(Optional)* Check **Dry Run** if you want to verify without committing changes.
6. Click **Run workflow**.

### Method 2: GitHub Issue
1. Open a new issue in this repository.
2. Add the label `schedule-update`.
3. Paste the coach's email in the issue body.
4. The workflow will automatically run, execute the update, and reply to the issue with the result and links to screenshots.

### Method 3: Local Testing
You can run the tests or dry-run locally:

```bash
# 1. Run unit tests on sample emails
npm test

# 2. Run dry-run locally with headed browser
TEAMUNIFY_USER="chris@icacswim.com" \
TEAMUNIFY_PASS="your-password" \
HEADLESS=false \
DRY_RUN=true \
COACH_EMAIL_BODY="Hi Parents, ..." \
npm run update-schedule
```

---

## 📁 Project Structure

```text
├── .github/
│   └── workflows/
│       └── update-schedule.yml    # GitHub Actions workflow
├── scripts/
│   ├── parse_schedule.js         # Core schedule & email parser
│   ├── update_schedule.js        # Playwright automation script
│   └── update_teamunify.js       # Original codegen recording (reference)
├── tests/
│   └── parse_schedule.test.js    # Unit tests with standard & cancellation emails
├── index.html                    # Public-facing calendar subscription page
└── package.json
```
