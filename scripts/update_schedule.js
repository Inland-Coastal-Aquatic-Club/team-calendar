import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSchedulePlan } from './parse_schedule.js';

// Setup directories
const SCREENSHOT_DIR = path.resolve('screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function takeScreenshot(page, name) {
  try {
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[Screenshot] Saved: ${filePath}`);
  } catch (err) {
    console.warn(`[Screenshot Error] Could not capture ${name}:`, err.message);
  }
}

/**
 * Locate the dynamic Back Office Practices iframe.
 * TeamUnify embeds back-office tools inside iframes with dynamically generated IDs.
 */
async function findPracticesFrame(page) {
  console.log('[Iframe] Searching for TeamUnify practices frame...');

  // First wait for any iframe matching dynamic patterns or src
  await page.waitForSelector('iframe', { timeout: 20000 });

  // Give Angular / DOM a brief moment to initialize the iframe content
  await page.waitForTimeout(2000);

  const frames = page.frames();
  for (const frame of frames) {
    try {
      const hasMonthBtn = await frame.getByRole('button', { name: 'Month' }).isVisible().catch(() => false);
      const hasCalendarGrid = await frame.locator('.grid-table, .calendar-table, .event-wrapper').first().isVisible().catch(() => false);
      if (hasMonthBtn || hasCalendarGrid) {
        console.log(`[Iframe] Found Practices frame: ${frame.url() || frame.name() || '(id match)'}`);
        return frame;
      }
    } catch {
      // Ignore cross-origin or detached frames
    }
  }

  // Fallback: check iframes with id prefix
  const iframeLoc = page.locator('iframe[id^="iframe"]').first();
  if (await iframeLoc.count() > 0) {
    const frameObj = await iframeLoc.contentFrame();
    if (frameObj) return frameObj;
  }

  throw new Error('Unable to find TeamUnify Practices calendar iframe.');
}

/**
 * Locate inner modal iframe inside the practices iframe
 */
async function findModalFrame(practicesFrame) {
  await practicesFrame.locator('iframe').first().waitFor({ state: 'attached', timeout: 15000 });
  const innerFrames = practicesFrame.childFrames();
  if (innerFrames.length > 0) {
    return innerFrames[innerFrames.length - 1];
  }
  return practicesFrame.locator('iframe').contentFrame();
}

/**
 * Extend a practice series repeating end date
 */
async function extendSeriesEndDate(practicesFrame, eventLocator, targetEndDay, formattedEndDate, isDryRun) {
  console.log(`[Update] Clicking event to edit recurring series...`);
  await eventLocator.click();
  await practicesFrame.waitForTimeout(500);

  // Click Edit button on the event popup/toolbar
  const editBtn = practicesFrame.getByRole('button', { name: 'Edit' });
  await editBtn.waitFor({ timeout: 5000 });
  await editBtn.click();
  await practicesFrame.waitForTimeout(1000);

  // Inside the modal dialog frame
  const modalFrame = await findModalFrame(practicesFrame);

  // 1. Choose "All in the series"
  console.log('[Update] Selecting "All in the series"...');
  const allSeriesText = modalFrame.getByText(/All in the series/i);
  const allSeriesRadio = modalFrame.getByRole('radio', { name: /All in the series/i });
  if (await allSeriesRadio.isVisible().catch(() => false)) {
    await allSeriesRadio.check();
  } else if (await allSeriesText.isVisible().catch(() => false)) {
    await allSeriesText.click();
  }

  // 2. Click "Edit Practice Repeat"
  console.log('[Update] Opening Edit Practice Repeat...');
  const editRepeatBtn = modalFrame.getByTitle(/Edit Practice Repeat/i);
  await editRepeatBtn.waitFor({ timeout: 5000 });
  await editRepeatBtn.click();
  await modalFrame.waitForTimeout(500);

  // 3. Update Repeat End Date
  console.log(`[Update] Setting repeat end date to day ${targetEndDay} (${formattedEndDate})...`);
  const calendarIcon = modalFrame.locator('#practiceRepeatEnd > div > .calendar, #practiceRepeatEnd .calendar-icon, #practiceRepeatEnd i').first();

  if (await calendarIcon.isVisible().catch(() => false)) {
    await calendarIcon.click();
    await modalFrame.waitForTimeout(500);

    // Click on target day in the open datepicker
    const dayCell = modalFrame.getByRole('cell', { name: String(targetEndDay), exact: true }).last();
    if (await dayCell.isVisible().catch(() => false)) {
      await dayCell.click();
    } else {
      // Fallback: match day text in datepicker table
      const textCell = modalFrame.locator('.practice-datepicker td, .practice-datepicker .ng-binding').filter({ hasText: new RegExp(`^${targetEndDay}$`) }).last();
      await textCell.click();
    }
  } else {
    // If there is an input field for end date
    const dateInput = modalFrame.locator('#practiceRepeatEnd input, input[name*="repeatEnd"]');
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill(formattedEndDate);
    }
  }

  // 4. Click "Done" on repeat settings
  const doneBtn = modalFrame.getByRole('button', { name: 'Done' });
  await doneBtn.click();
  await modalFrame.waitForTimeout(500);

  // 5. Save changes
  if (isDryRun) {
    console.log('[DRY RUN] Skipping #btnSavePractice click.');
    // Close modal without saving
    const cancelBtn = modalFrame.getByRole('button', { name: /Cancel|Close/i }).or(modalFrame.locator('.close, .fa-times').first());
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
  } else {
    console.log('[Update] Saving practice...');
    const saveBtn = modalFrame.locator('#btnSavePractice');
    await saveBtn.click();
    await practicesFrame.waitForTimeout(1500);
  }
}

/**
 * Delete / cancel a single occurrence of a practice on a specific date
 */
async function deleteSingleOccurrence(practicesFrame, eventLocator, isDryRun) {
  console.log(`[Cancel] Clicking practice to delete single occurrence...`);
  await eventLocator.click();
  await practicesFrame.waitForTimeout(500);

  const deleteBtn = practicesFrame.getByRole('button', { name: /Delete/i }).or(practicesFrame.locator('.btn-delete, [title*="Delete"]'));
  if (await deleteBtn.isVisible().catch(() => false)) {
    await deleteBtn.click();
    await practicesFrame.waitForTimeout(500);

    const modalFrame = await findModalFrame(practicesFrame);
    // Select "Only this instance" / "Just this occurrence"
    const singleOccurrenceOption = modalFrame.getByText(/Only this instance|Just this occurrence|Only this one/i).or(modalFrame.getByRole('radio', { name: /Only this instance|Just this occurrence/i }));
    if (await singleOccurrenceOption.isVisible().catch(() => false)) {
      await singleOccurrenceOption.click();
    }

    if (isDryRun) {
      console.log('[DRY RUN] Skipping delete confirmation.');
      const cancelBtn = modalFrame.getByRole('button', { name: /Cancel|Close/i });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }
    } else {
      const confirmDeleteBtn = modalFrame.getByRole('button', { name: /Delete|Confirm|OK/i });
      await confirmDeleteBtn.click();
      await practicesFrame.waitForTimeout(1000);
    }
  }
}

/**
 * Main execution function
 */
export async function runScheduleUpdate() {
  const emailText = process.env.COACH_EMAIL_BODY;
  if (!emailText || !emailText.trim()) {
    throw new Error('COACH_EMAIL_BODY environment variable is empty. Please provide the email body.');
  }

  const teamunifyUser = process.env.TEAMUNIFY_USER || 'chris@icacswim.com';
  const teamunifyPass = process.env.TEAMUNIFY_PASS;
  if (!teamunifyPass) {
    throw new Error('TEAMUNIFY_PASS secret/environment variable is required.');
  }

  const isDryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  const isHeadless = process.env.HEADLESS !== 'false';
  const slowMo = parseInt(process.env.SLOWMO || '300', 10);

  console.log('=====================================================');
  console.log(' ICAC Swim Practice Schedule Automation');
  console.log(` Mode: ${isDryRun ? 'DRY RUN (No changes saved)' : 'LIVE EXECUTION'}`);
  console.log(` User: ${teamunifyUser}`);
  console.log(` Headless: ${isHeadless}`);
  console.log('=====================================================');

  // Step 1: Parse the schedule email
  console.log('[Step 1] Parsing schedule email...');
  const plan = generateSchedulePlan(emailText);
  console.log(`[Schedule Plan] Week: ${plan.week.rawMatch}`);
  console.log(`[Schedule Plan] Target End Date: ${plan.week.formattedEndDate} (Day ${plan.week.targetEndDayNumber})`);
  console.log(`[Schedule Plan] Cancellations: ${plan.cancellationsToDelete.length}`);
  console.log(`[Schedule Plan] Additions / Drylands: ${plan.additions.length}`);

  // Step 2: Launch browser
  console.log('[Step 2] Launching Playwright browser...');
  const browser = await chromium.launch({
    headless: isHeadless,
    slowMo: slowMo
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    // Step 3: Login to TeamUnify
    console.log('[Step 3] Navigating to https://www.icacswim.com/page/home...');
    await page.goto('https://www.icacswim.com/page/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await takeScreenshot(page, '01-home-page');

    const signInLink = page.getByRole('link', { name: /Sign in/i });
    if (await signInLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Auth] Clicking Sign in...');
      await signInLink.click();
      await page.waitForTimeout(1000);

      console.log(`[Auth] Entering credentials for ${teamunifyUser}...`);
      const emailInput = page.getByRole('textbox', { name: /Enter Email or Phone/i });
      await emailInput.fill(teamunifyUser);
      await page.getByRole('button', { name: /Continue/i }).click();
      await page.waitForTimeout(1000);

      const passInput = page.getByRole('textbox', { name: /Password/i });
      await passInput.fill(teamunifyPass);
      await page.getByRole('button', { name: /Sign In/i }).click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.log('[Auth] Sign in submitted successfully.');
    } else {
      console.log('[Auth] Already signed in or Sign in link not visible.');
    }
    await takeScreenshot(page, '02-after-login');

    // Step 4: Navigate to Back Office -> Practices
    console.log('[Step 4] Opening Back Office...');
    const backOfficeLink = page.getByRole('link', { name: /Back Office/i });
    await backOfficeLink.waitFor({ timeout: 15000 });
    await backOfficeLink.click();
    await page.waitForTimeout(2000);

    console.log('[Step 4] Opening Practices section...');
    const practicesNav = page.locator('label, a, span').filter({ hasText: /^Practices$/i }).first();
    await practicesNav.waitFor({ timeout: 15000 });
    await practicesNav.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '03-back-office-practices');

    // Step 5: Locate the Practices Frame and ensure Month view
    console.log('[Step 5] Locating Practices Calendar Frame...');
    const practicesFrame = await findPracticesFrame(page);

    const monthBtn = practicesFrame.getByRole('button', { name: 'Month' });
    if (await monthBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Calendar] Switching to Month view...');
      await monthBtn.click();
      await practicesFrame.waitForTimeout(1000);
    }
    await takeScreenshot(page, '04-month-view');

    // Step 6: Extend recurring practice series
    console.log('[Step 6] Extending recurring practice series to week ending date...');
    const targetEndDay = plan.week.targetEndDayNumber;
    const formattedEndDate = plan.week.formattedEndDate;

    // Groups to update from Monday (MWF series)
    const mwfGroups = ['B', 'T', 'AG1', 'AG2', 'AG3', 'SR1', 'SR2'];
    for (const grp of mwfGroups) {
      const loc = practicesFrame.locator('.event-item, .title-wrapper').filter({ hasText: grp }).first();
      if (await loc.isVisible().catch(() => false)) {
        console.log(`[Series] Found series item for ${grp}, extending repeat end date...`);
        try {
          await extendSeriesEndDate(practicesFrame, loc, targetEndDay, formattedEndDate, isDryRun);
        } catch (e) {
          console.warn(`[Warning] Could not extend series for ${grp}:`, e.message);
        }
      }
    }

    // Step 7: Handle Cancellations
    if (plan.cancellationsToDelete.length > 0) {
      console.log('[Step 7] Processing cancellations for the week...');
      for (const cancelItem of plan.cancellationsToDelete) {
        console.log(`[Cancellation] ${cancelItem.day} (${cancelItem.date}): ${cancelItem.reason}`);
        // If practices on that day should be canceled/removed
        // Locate day column/cell and find practices to delete single occurrence
        const dayCell = practicesFrame.locator('.grid-table td').filter({ hasText: cancelItem.day }).first();
        if (await dayCell.isVisible().catch(() => false)) {
          const eventsOnDay = dayCell.locator('.event-item');
          const count = await eventsOnDay.count();
          for (let i = 0; i < count; i++) {
            try {
              await deleteSingleOccurrence(practicesFrame, eventsOnDay.nth(i), isDryRun);
            } catch (err) {
              console.warn(`[Warning] Could not delete occurrence on ${cancelItem.day}:`, err.message);
            }
          }
        }
      }
    }

    await takeScreenshot(page, '05-final-calendar-state');
    console.log('[Success] Schedule update automation completed!');

  } catch (err) {
    console.error('[Error] Execution failed:', err);
    await takeScreenshot(page, 'error-state');
    throw err;
  } finally {
    await browser.close();
  }
}

// Allow running directly via CLI
if (process.argv[1] && process.argv[1].endsWith('update_schedule.js')) {
  runScheduleUpdate().catch((err) => {
    console.error(`[Fatal Error] ${err.message}`);
    process.exit(1);
  });
}
