// commands/help.js
export function registerHelpCommand(bot) {
  const botCommands = [
    {
      command: '/commands',
      description: 'Show the list of available commands',
      usecase: 'Shows all bot commands in a button menu. Example: `/commands`'
    },
    {
      command: '/groups_all',
      description: 'List all groups where the bot is present',
      usecase: 'Shows every group the bot has joined, with clickable links. Example: `/groups_all`'
    },
    {
      command: '/groups_active',
      description: 'List active groups in last 24h',
      usecase: 'Displays only the groups that were active in the last 24 hours. Example: `/groups_active`'
    },
     {
    command: '/reminder',
    description: 'Reminder commands',
    usecase: `**🕒 Reminder Types**

    1. **/reminder <minutes>**  
    Set a reminder with the default message.  
    _Example:_ \`/reminder 10\` → reminds in 10 minutes with default text.

    2. **/reminder <minutes> <custom text>**  
    Set a reminder with a custom message.  
    _Example:_ \`/reminder 10 Drink water\`

    3. **/reminder <minutes> --delete <custom text>**  
    Delete the old reminder when setting a new one.  
    _Example:_ \`/reminder 5 --delete Vote now!\`

    ---

    **🔧 Other Commands**

    4. **/stopreminder**  
    Stop the reminder for the replied-to poll/message.  
    _Example:_ reply to a poll → \`/stopreminder\`

    5. **/listreminders**  
    List all currently active reminders.  
    _Example:_ \`/listreminders\`

    6. **/resetreminders**  
    Stop & clear **all** reminders.  
    _Example:_ \`/resetreminders\`
    `
    },
    {
      command: '/whisper',
      description: 'Send a private whisper to someone',
      usecase: 'Example: `rem whisper I love you @john` → sends a secret message only John can open.'
    }
  ];

  // Register commands in Telegram’s menu
  bot.setMyCommands(botCommands.map(c => ({
    command: c.command.replace('/', ''),
    description: c.description
  })));

  // /commands → Button list
  bot.onText(/^\/commands$/, async (msg) => {
    const chatId = msg.chat.id;
    const inlineKeyboard = botCommands.map(cmd => ([{
      text: cmd.command,
      callback_data: `cmd:${cmd.command}`
    }]));

    await bot.sendMessage(chatId, '*📜 Command List:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  });

  // Handle button clicks
  bot.on('callback_query', async (query) => {
    if (query.data?.startsWith('cmd:')) {
      const selectedCommand = query.data.split(':')[1];
      const cmdInfo = botCommands.find(c => c.command === selectedCommand);

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
