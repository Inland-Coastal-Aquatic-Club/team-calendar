/**
 * Schedule Parser for ICAC Swim Team
 * Extracts week date range, practice groups, times, cancellations, and additions
 * from the weekly coach schedule email.
 */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const DAY_NAMES = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

/**
 * Standard group code definitions in TeamUnify
 */
export const GROUP_DEFINITIONS = {
  black: { name: 'Black', codes: ['B'], key: 'black' },
  teal: { name: 'Teal', codes: ['T'], key: 'teal' },
  age: { name: 'Age Group', codes: ['AG1', 'AG2', 'AG3'], key: 'age' },
  senior: { name: 'Senior', codes: ['SR1', 'SR2'], key: 'senior' }
};

/**
 * Resolve a descriptive group string to its constituent TeamUnify codes.
 * E.g. "Age Group" -> ["AG1", "AG2", "AG3"]
 *      "Age Group 1" -> ["AG1"]
 *      "Senior & Age Group 1" -> ["AG1", "SR1", "SR2"]
 */
export function resolveGroupCodes(groupString) {
  if (!groupString) return [];
  const text = groupString.toLowerCase();
  const codes = new Set();

  if (/\bblack\b|\bb\b/i.test(text)) {
    codes.add('B');
  }

  if (/\bteal\b|\bt\b/i.test(text)) {
    codes.add('T');
  }

  if (/\bage\s*group\s*1\b|\bag1\b/i.test(text)) {
    codes.add('AG1');
  }
  if (/\bage\s*group\s*2\b|\bag2\b/i.test(text)) {
    codes.add('AG2');
  }
  if (/\bage\s*group\s*3\b|\bag3\b/i.test(text)) {
    codes.add('AG3');
  }
  if (/\bage\s*group\b/i.test(text) && !/\bage\s*group\s*[123]\b/i.test(text) && !/\bag[123]\b/i.test(text)) {
    codes.add('AG1');
    codes.add('AG2');
    codes.add('AG3');
  }

  if (/\bsenior\s*1\b|\bsr1\b/i.test(text)) {
    codes.add('SR1');
  }
  if (/\bsenior\s*2\b|\bsr2\b/i.test(text)) {
    codes.add('SR2');
  }
  if (/\bsenior\b/i.test(text) && !/\bsenior\s*[12]\b/i.test(text) && !/\bsr[12]\b/i.test(text)) {
    codes.add('SR1');
    codes.add('SR2');
  }

  return Array.from(codes);
}

/**
 * Clean ordinal suffixes like "24th", "1st", "2nd", "3rd"
 */
function cleanDayNumber(str) {
  return parseInt(str.replace(/(?:st|nd|rd|th)/gi, '').trim(), 10);
}

/**
 * Parse the week header from the email text
 * Examples:
 * - "week of August 24th - 29th"
 * - "week of August 31st - September 5th"
 */
export function parseWeekRange(text, referenceYear = new Date().getFullYear()) {
  const weekRegex = /week\s+of\s+([A-Za-z]+)\s+(\d+(?:st|nd|rd|th)?)\s*[-–—]\s*(?:([A-Za-z]+)\s+)?(\d+(?:st|nd|rd|th)?)/i;
  const match = text.match(weekRegex);

  if (!match) {
    throw new Error('Could not find a valid "week of [Month] [Start] - [End]" in the email text.');
  }

  const startMonthStr = match[1].toLowerCase();
  const startDay = cleanDayNumber(match[2]);
  const endMonthStr = match[3] ? match[3].toLowerCase() : startMonthStr;
  const endDay = cleanDayNumber(match[4]);

  const startMonth = MONTH_MAP[startMonthStr];
  const endMonth = MONTH_MAP[endMonthStr];

  if (!startMonth || !endMonth) {
    throw new Error(`Unrecognized month in: "${match[0]}"`);
  }

  // Handle year rollover if week spans December to January
  let startYear = referenceYear;
  let endYear = referenceYear;
  if (startMonth === 12 && endMonth === 1) {
    endYear = referenceYear + 1;
  }

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  const pad = (n) => String(n).padStart(2, '0');
  const formattedEndDate = `${pad(endMonth)}/${pad(endDay)}/${endYear}`;
  const isoStartDate = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
  const isoEndDate = `${endYear}-${pad(endMonth)}-${pad(endDay)}`;

  return {
    rawMatch: match[0],
    startMonth,
    startMonthName: MONTH_NAMES[startMonth - 1],
    startDay,
    endMonth,
    endMonthName: MONTH_NAMES[endMonth - 1],
    endDay,
    startYear,
    endYear,
    startDate,
    endDate,
    targetEndDayNumber: endDay,
    formattedEndDate,
    isoStartDate,
    isoEndDate
  };
}

/**
 * Parse daily schedule items and cancellations
 */
export function parseDailySchedule(text, weekInfo) {
  const lines = text.split(/\r?\n/);
  const days = {};

  const dayHeaderRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+(?:([A-Za-z]+)\s+)?(\d+(?:st|nd|rd|th)?):?\s*(.*)$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(dayHeaderRegex);
    if (!match) continue;

    const dayOfWeek = match[1].toLowerCase();
    const capitalizedDay = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const monthStr = match[2] ? match[2].toLowerCase() : weekInfo.startMonthName;
    const monthNum = MONTH_MAP[monthStr] || weekInfo.startMonth;
    const dayNum = cleanDayNumber(match[3]);
    const content = match[4].trim();

    const dayData = {
      dayOfWeek: capitalizedDay,
      month: monthNum,
      day: dayNum,
      dateString: `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}`,
      rawText: content,
      isAllCanceled: false,
      canceledGroups: [],
      practices: [],
      drylands: [],
      notes: []
    };

    // Check for full swim practice cancellation
    if (/NO\s+SWIM\s+PRACTICE\s+FOR\s+ALL\s+GROUPS/i.test(content) || /ALL\s+(?:SWIM\s+)?PRACTICES?\s+CANCEL(?:L)?ED/i.test(content)) {
      dayData.isAllCanceled = true;
      dayData.canceledGroups = ['Black', 'Teal', 'Age Group', 'Senior'];
    }

    // Check for specific group cancellations
    const groupCancelMatch = content.match(/NO\s+(?:SWIM\s+)?PRACTICE\s+FOR\s+([A-Za-z\s&]+?)(?:,|\.|$|because)/i);
    if (groupCancelMatch && !dayData.isAllCanceled) {
      const canceledText = groupCancelMatch[1].toLowerCase();
      if (canceledText.includes('black')) dayData.canceledGroups.push('Black');
      if (canceledText.includes('teal')) dayData.canceledGroups.push('Teal');
      if (canceledText.includes('age')) dayData.canceledGroups.push('Age Group');
      if (canceledText.includes('senior')) dayData.canceledGroups.push('Senior');
    }

    // Extract Drylands (e.g. Drylands for Senior & Age Group 1 4:30pm - 6:00pm)
    const drylandRegex = /Drylands(?:\s+for\s+(.+?))?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i;
    const drylandMatch = content.match(drylandRegex);
    if (drylandMatch) {
      const dGroup = drylandMatch[1] ? drylandMatch[1].trim() : 'All';
      dayData.drylands.push({
        group: dGroup,
        codes: resolveGroupCodes(dGroup),
        startTime: drylandMatch[2].trim(),
        endTime: drylandMatch[3].trim(),
        raw: drylandMatch[0]
      });
    }

    // Extract individual practice segments separated by semicolons
    const segments = content.split(';').map(s => s.trim()).filter(Boolean);

    const practiceRegex = /(Black|Teal|Age\s+Group(?:\s*\d)?|Senior(?:\s*\d)?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i;

    for (const segment of segments) {
      // If segment is about Drylands or general cancellation, skip for swim practices
      if (/drylands?/i.test(segment) || /NO\s+SWIM\s+PRACTICE/i.test(segment)) {
        continue;
      }
      const pMatch = segment.match(practiceRegex);
      if (pMatch) {
        const groupName = pMatch[1].replace(/\s+/g, ' ').trim();
        dayData.practices.push({
          group: groupName,
          codes: resolveGroupCodes(groupName),
          startTime: pMatch[2].trim(),
          endTime: pMatch[3].trim(),
          raw: pMatch[0]
        });
      }
    }

    days[capitalizedDay] = dayData;
  }

  return days;
}

/**
 * Compute the complete planned actions for TeamUnify
 */
export function generateSchedulePlan(emailText, referenceYear = new Date().getFullYear()) {
  const weekInfo = parseWeekRange(emailText, referenceYear);
  const days = parseDailySchedule(emailText, weekInfo);

  // Determine series extensions
  // Recurring series to extend:
  // - Monday MWF Series: Black, Teal, AG1, AG2, AG3, SR1, SR2
  // - Tuesday T/Th Series: AG1, AG2, AG3, SR1, SR2
  // - Saturday Series: SR1, SR2
  const seriesToExtend = [
    { day: 'Monday', series: ['B', 'T', 'AG1', 'AG2', 'AG3', 'SR1', 'SR2'], targetEndDay: weekInfo.targetEndDayNumber },
    { day: 'Tuesday', series: ['AG1', 'AG2', 'AG3', 'SR1', 'SR2'], targetEndDay: weekInfo.targetEndDayNumber },
    { day: 'Saturday', series: ['SR1', 'SR2'], targetEndDay: weekInfo.targetEndDayNumber }
  ];

  // Determine cancellations that must be removed/deleted for specific dates
  const cancellationsToDelete = [];
  for (const [dayName, dayData] of Object.entries(days)) {
    if (dayData.isAllCanceled) {
      cancellationsToDelete.push({
        day: dayName,
        date: dayData.dateString,
        allGroups: true,
        groups: dayData.canceledGroups,
        codes: ['B', 'T', 'AG1', 'AG2', 'AG3', 'SR1', 'SR2'],
        reason: dayData.rawText
      });
    } else if (dayData.canceledGroups.length > 0) {
      cancellationsToDelete.push({
        day: dayName,
        date: dayData.dateString,
        allGroups: false,
        groups: dayData.canceledGroups,
        codes: resolveGroupCodes(dayData.canceledGroups.join(' ')),
        reason: dayData.rawText
      });
    }
  }

  // Determine one-off additions
  const additions = [];
  for (const [dayName, dayData] of Object.entries(days)) {
    // Check for Drylands
    for (const d of dayData.drylands) {
      additions.push({
        type: 'Drylands',
        day: dayName,
        date: dayData.dateString,
        group: d.group,
        codes: d.codes,
        startTime: d.startTime,
        endTime: d.endTime
      });
    }

    // Check for unusual / extra practices (e.g. morning Senior on Wednesday or Saturday Age Group)
    for (const p of dayData.practices) {
      const isMorningPractice = /am/i.test(p.startTime) && dayName !== 'Saturday';
      const isSaturdayAgeGroup = dayName === 'Saturday' && /Age/i.test(p.group);
      if (isMorningPractice || isSaturdayAgeGroup) {
        additions.push({
          type: 'ExtraPractice',
          day: dayName,
          date: dayData.dateString,
          group: p.group,
          codes: p.codes,
          startTime: p.startTime,
          endTime: p.endTime
        });
      }
    }
  }

  return {
    week: weekInfo,
    days,
    seriesToExtend,
    cancellationsToDelete,
    additions
  };
}

/**
 * Format the parsed schedule into a clean, easy-to-read WhatsApp message
 * with minimal formatting and no emoji clutter.
 */
export function formatWhatsAppMessage(plan) {
  let msg = `*ICAC Swim Practice Schedule*\n`;
  msg += `*${plan.week.rawMatch.replace(/^week\s+of\s+/i, 'Week of ')}*\n\n`;

  for (const [dayName, day] of Object.entries(plan.days)) {
    msg += `*${dayName}, ${day.dateString}*\n`;

    if (day.isAllCanceled) {
      msg += `- NO SWIM PRACTICE FOR ALL GROUPS\n`;
    }

    for (const p of day.practices) {
      msg += `- ${p.group}: ${p.startTime} - ${p.endTime}\n`;
    }

    for (const d of day.drylands) {
      msg += `- Drylands (${d.group}): ${d.startTime} - ${d.endTime}\n`;
    }

    msg += `\n`;
  }

  return msg.trim();
}
