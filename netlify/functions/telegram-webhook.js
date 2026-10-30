// Telegram webhook (/.netlify/functions/telegram-webhook). The bot itself is in shared/telegram-bot.js.
import bot from '../shared/telegram-bot.js';
import { asV2 } from '../shared/lambda-adapter.mjs';

export default asV2(bot.handler);
