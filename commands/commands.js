export function registerHelpCommand(bot) {
  const botCommands = {
    user: [
      { command: '/commands', description: 'Show the list of available commands', usecase: 'Shows all bot commands in a button menu. Example: `/commands`' },
      { command: '/groups_all', description: 'List all groups where the bot is present', usecase: 'Shows every group the bot has joined, with clickable links. Example: `/groups_all`' },
      { command: '/groups_active', description: 'List active groups in last 24h', usecase: 'Displays only the groups that were active in the last 24 hours. Example: `/groups_active`' },
      { command: '/reminder', description: 'Reminder commands', usecase: 'Full reminder usage instructions...' },
      { command: '/whisper', description: 'Send a private whisper to someone', usecase: 'Example: `rem whisper I love you @john` → sends a secret message only John can open.' }
    ],
    admin: [
      { command: '/ban', description: 'Ban a user from the group', usecase: 'Reply to a user, or use /ban @username or /ban <userID>. Optional reason: `/ban @john spamming`' },
      { command: '/unban', description: 'Unban a user from the group', usecase: 'Reply to a banned user, or use /unban @username or /unban <userID>' },
      { command: '/del', description: 'Delete a single message', usecase: 'Reply to a message and type `/del` to remove it from the chat (admins only)' },
      { command: '/delban', description: 'Delete a single message and ban the user', usecase: 'Reply to a message and type `/delban` to remove the msg and ban the user from the chat (admins only)' },
      { command: '/adminmode', description: 'Toggle admin mode for the bot (on/off)', usecase: 'Example: `/adminmode on` → enables admin mode globally. Example: `/adminmode off` → disables admin mode globally. Only real group admins (or bot owner in private) can use this.' }
    ]
  };

  // Flatten commands for Telegram menu
  const flatCommands = [...botCommands.user, ...botCommands.admin].map(c => ({
    command: c.command.replace('/', ''),
    description: c.description
  }));
  bot.setMyCommands(flatCommands);

  // /commands → Button list
  bot.onText(/^\/commands$/, async (msg) => {
    const chatId = msg.chat.id;

    const buildKeyboard = (arr) => arr.map(c => ([{ text: c.command, callback_data: `cmd:${c.command}` }]));

    await bot.sendMessage(chatId, '*📜 Command List:*\n\n*User Commands*:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buildKeyboard(botCommands.user) }
    });

    await bot.sendMessage(chatId, '*🔧 Admin Commands:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buildKeyboard(botCommands.admin) }
    });
  });

  // Handle button clicks
  bot.on('callback_query', async (query) => {
    if (query.data?.startsWith('cmd:')) {
      const selectedCommand = query.data.split(':')[1];

      // Search both user & admin commands
      const cmdInfo = [...botCommands.user, ...botCommands.admin].find(c => c.command === selectedCommand);

      if (cmdInfo) {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(
          query.message.chat.id,
          `*${cmdInfo.command}*\n_${cmdInfo.description}_\n\n${cmdInfo.usecase}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  });
}
