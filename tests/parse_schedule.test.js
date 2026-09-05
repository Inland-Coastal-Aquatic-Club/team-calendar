import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeekRange, parseDailySchedule, generateSchedulePlan, formatWhatsAppMessage } from '../scripts/parse_schedule.js';

const standardEmail = `
Hi Parents,

Here is the swim practice schedule for the week of August 24th - 29th. We will also be having a Parents Meeting on Wednesday, August 26th at 5:00pm to nominate new board members. We need help on the BBC Board. Thank you!

Monday, August 24th: Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Tuesday, August 25th: Age Group 5:00pm - 6:30pm; Senior 5:00pm - 7:00pm

Wednesday, August 26th: Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Thursday, August 27th: Age Group 5:00pm - 6:30pm; Senior 5:00pm - 7:00pm

Friday, August 28th: Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Saturday, August 29th: Senior 7:00am - 9:30am

Coach Scott
`;

const cancellationEmail = `
Email with cancellations:Hi Parents,

Here is the swim practice schedule for the week of August 31st - September 5th. High School Water Polo will have games on Tuesday and Thursday this week. 

Monday, August 31st: Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Tuesday, September 1st: NO SWIM PRACTICE FOR ALL GROUPS, because of High School Water Polo Games. We will have Drylands for Senior & Age Group 1 4:30pm - 6:00pm.

Wednesday, September 2nd: Senior 5:30am - 7:00am; Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Thursday, September 3rd: NO SWIM PRACTICE FOR ALL GROUPS, because of High School Water Polo Games. We will have Drylands for Senior & Age Group 1 4:30pm - 6:00pm.

Friday, September 4th: Black 4:30pm - 5:30pm; Age Group 4:30pm - 6:00pm; Teal 5:30pm - 6:30pm; Senior 5:30pm - 7:30pm

Saturday, September 5th: Senior 7:00am - 9:30am; Age Group 8:00am - 9:30am

Coach Scott
`;

test('parses standard email week range and practices correctly', () => {
  const plan = generateSchedulePlan(standardEmail, 2026);

  assert.equal(plan.week.startMonth, 8);
  assert.equal(plan.week.startDay, 24);
  assert.equal(plan.week.endMonth, 8);
  assert.equal(plan.week.endDay, 29);
  assert.equal(plan.week.targetEndDayNumber, 29);
  assert.equal(plan.week.formattedEndDate, '08/29/2026');

  // Days parsed
  assert.ok(plan.days.Monday);
  assert.equal(plan.days.Monday.practices.length, 4);
  assert.equal(plan.days.Monday.practices[0].group, 'Black');
  assert.equal(plan.days.Monday.practices[0].startTime, '4:30pm');
  assert.equal(plan.days.Monday.practices[0].endTime, '5:30pm');

  assert.ok(plan.days.Saturday);
  assert.equal(plan.days.Saturday.practices.length, 1);
  assert.equal(plan.days.Saturday.practices[0].group, 'Senior');

  // No cancellations
  assert.equal(plan.cancellationsToDelete.length, 0);
  assert.equal(plan.additions.length, 0);
});

test('parses cancellation email with multi-month rollover, cancellations, and drylands', () => {
  const plan = generateSchedulePlan(cancellationEmail, 2026);

  assert.equal(plan.week.startMonth, 8);
  assert.equal(plan.week.startDay, 31);
  assert.equal(plan.week.endMonth, 9);
  assert.equal(plan.week.endDay, 5);
  assert.equal(plan.week.targetEndDayNumber, 5);
  assert.equal(plan.week.formattedEndDate, '09/05/2026');

  // Tuesday cancellations and drylands
  assert.ok(plan.days.Tuesday);
  assert.equal(plan.days.Tuesday.isAllCanceled, true);
  assert.equal(plan.days.Tuesday.drylands.length, 1);
  assert.equal(plan.days.Tuesday.drylands[0].startTime, '4:30pm');
  assert.equal(plan.days.Tuesday.drylands[0].endTime, '6:00pm');

  // Thursday cancellations and drylands
  assert.ok(plan.days.Thursday);
  assert.equal(plan.days.Thursday.isAllCanceled, true);
  assert.equal(plan.days.Thursday.drylands.length, 1);

  // Cancellations detected
  assert.equal(plan.cancellationsToDelete.length, 2);
  assert.equal(plan.cancellationsToDelete[0].day, 'Tuesday');
  assert.equal(plan.cancellationsToDelete[0].allGroups, true);
  assert.equal(plan.cancellationsToDelete[1].day, 'Thursday');
  assert.equal(plan.cancellationsToDelete[1].allGroups, true);

  // Additions (Drylands x2, Wednesday morning Senior, Saturday Age Group)
  assert.equal(plan.additions.length, 4);
  const wedMorning = plan.additions.find(a => a.day === 'Wednesday' && a.startTime === '5:30am');
  assert.ok(wedMorning);
  assert.equal(wedMorning.group, 'Senior');

  const satAge = plan.additions.find(a => a.day === 'Saturday' && a.group === 'Age Group');
  assert.ok(satAge);
  assert.equal(satAge.startTime, '8:00am');
});

test('generates formatted WhatsApp message with emojis and bullet points', () => {
  const plan = generateSchedulePlan(cancellationEmail, 2026);
  const wa = formatWhatsAppMessage(plan);

  assert.ok(wa.includes('🏊‍♂️ *ICAC Swim Practice Schedule*'));
  assert.ok(wa.includes('Week of August 31st - September 5th'));
  assert.ok(wa.includes('🚫 *Tuesday, 09/01*'));
  assert.ok(wa.includes('• ❌ NO SWIM PRACTICE FOR ALL GROUPS'));
  assert.ok(wa.includes('🏋️ Drylands (Senior & Age Group 1)'));
  assert.ok(wa.includes('• Senior: 7:00am - 9:30am'));
  assert.ok(wa.includes('• Age Group: 8:00am - 9:30am'));
  assert.ok(wa.includes('https://www.icacswim.com'));
});
