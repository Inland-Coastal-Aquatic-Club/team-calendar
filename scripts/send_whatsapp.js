import fs from 'node:fs';
import path from 'node:path';
import { generateSchedulePlan, formatWhatsAppMessage } from './parse_schedule.js';

export async function processWhatsAppMessage() {
  const emailText = process.env.COACH_EMAIL_BODY;
  if (!emailText || !emailText.trim()) {
    console.log('[WhatsApp] No email body provided. Skipping WhatsApp output.');
    return;
  }

  const plan = generateSchedulePlan(emailText);
  const formattedText = formatWhatsAppMessage(plan);

  console.log('\n=====================================================');
  console.log('📱 FORMATTED WHATSAPP MESSAGE');
  console.log('=====================================================');
  console.log(formattedText);
  console.log('=====================================================\n');

  // Save to file so GitHub Actions can use it in job summaries or comments
  const outputFilePath = path.resolve('whatsapp_message.txt');
  fs.writeFileSync(outputFilePath, formattedText, 'utf8');

  // Generate click-to-chat link
  const encodedText = encodeURIComponent(formattedText);
  const clickToChatUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
  console.log(`[WhatsApp Link] One-click share URL:\n${clickToChatUrl}\n`);

  // Optional: Direct API Dispatch (e.g. Green-API, UltraMsg, Whapi, or custom webhook)
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_TOKEN;
  const chatId = process.env.WHATSAPP_CHAT_ID; // e.g. 120363024849204820@g.us for groups

  if (apiUrl && token && chatId) {
    console.log(`[WhatsApp API] Sending message directly to chat ID ${chatId}...`);
    try {
      const endpoint = apiUrl.replace(/\/+$/, '');
      const response = await fetch(`${endpoint}/sendMessage?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId,
          message: formattedText
        })
      });

      const resData = await response.text();
      console.log(`[WhatsApp API] Response status: ${response.status}`);
      console.log(`[WhatsApp API] Response body: ${resData}`);
    } catch (apiErr) {
      console.error('[WhatsApp API Error] Could not dispatch message:', apiErr.message);
    }
  } else {
    console.log('[WhatsApp API] No WHATSAPP_API_URL / WHATSAPP_TOKEN configured. Generated 1-click link instead.');
  }

  return { formattedText, clickToChatUrl };
}

if (process.argv[1] && process.argv[1].endsWith('send_whatsapp.js')) {
  processWhatsAppMessage().catch((err) => {
    console.error(`[WhatsApp Error] ${err.message}`);
    process.exit(1);
  });
}
