const Discord = require('discord.js');
const fs = require('fs');
const { prefix, version, avatars } = require('../settings.json');
const Utilities = require('./utilities.js');

let config, credentials;
if (process.env._ == '/app/.heroku/node/bin/npm') {
	// Use Heroku Config Vars when running on Heroku
	config = {
		randomColorGuilds: process.env.RANDOM_COLOR_GUILDS.split('|'),
		randomColorRoles: process.env.RANDOM_COLOR_ROLES.split('|'),
		debugChannel: process.env.DEBUG_CHANNEL,
		dataChannel: process.env.DATA_CHANNEL,
		logChannel: process.env.LOG_CHANNEL,
		ownerId: process.env.OWNER_ID,
		blockedRoles: process.env.BLOCKED_ROLES.split('|'),
	};
	credentials = {
		discord_token: process.env.TOKEN,
	};
} else {
	config = require('../config.json');
	credentials = require('../credentials.json');
}

// Create a new Discord client
const client = new Discord.Client();

client.bot = {
	settings: {
		prefix: prefix,
		version: version,
		avatars: avatars,
	},
	config: config,
	shuttingDown: false,
};

client.plugins = new Discord.Collection();
client.commands = new Discord.Collection();
// For some reason, fs and require are in different "working directories"
const pluginFiles = fs.readdirSync('./src/commands/').filter(file => file.endsWith('.js'));
for (const file of pluginFiles) {
	const plugin = require(`./commands/${file}`);
	const pluginCommands = new Discord.Collection();
	client.plugins.set(plugin.name, pluginCommands);

	for (let i = 0; i < plugin.commands.length; i++) {
		const command = plugin.commands[i];
		pluginCommands.set(command.name, command);
		client.commands.set(command.name, { pluginName: plugin.name, commandName: command.name });

		if (Array.isArray(command.aliases) && command.aliases.length > 0) {
			for (let j = 0; j < command.aliases.length; j++) {
				client.commands.set(command.aliases[j], { pluginName: plugin.name, commandName: command.name });
			}
		}
	}
}

client.userInfo = new Map();
client.responseCache = new Map();
client.sessions = new Map();

client.cooldowns = {
	users: new Map(),
	channels: new Map(),
	// servers: new Map(),
};

const ColorHash = require('color-hash');
const colorHash = new ColorHash();

function changeRandomColorRole(color, serverId, roleId) {
	client.guilds.fetch(serverId)
		.then(guild => {
			guild.roles.fetch(roleId)
				.then(role => {
					if (role.hexColor !== color) {
						role.setColor(color);
					}
				})
				.catch(console.error);
		})
		.catch(console.error);
}

function updateRandomColorRoles() {
	const color = colorHash.hex((new Date()).toLocaleDateString());
	for (let i = 0; i < config.randomColorGuilds.length; i++) {
		changeRandomColorRole(color, config.randomColorGuilds[i], config.randomColorRoles[i]);
	}
}

// When the client is ready, run this code
// This event will only trigger one time after logging in
client.once('ready', () => {
	console.log('Ready!');
	// client.user.setPresence({ activity: { name: '!commands' } });
	// Reset variables every 10 minutes
	setInterval(Utilities.resetVariables, 60000, client);
	// Check every hour
	setInterval(updateRandomColorRoles, 3600000);
});

client.on('message', message => {
	let args = message.content.slice(prefix.length).split(/ +/);
	const command = args.shift().toLowerCase();

	// Remove wrapping [ and ] from args
	args = args.map(arg => Utilities.removeBrackets(arg));

	if (!message.author.bot && message.content.startsWith(prefix)) {
		if (!Utilities.isOwner(client, message.author.id)) {
			for (let i = 0; i < config.blockedRoles.length; i++) {
				if (message.member.roles.cache.has(config.blockedRoles[i])) {
					// Don't let this member use any commands
					return;
				}
			}
		}
		if (client.commands.has(command)) {
			try {
				const { pluginName, commandName } = client.commands.get(command);
				if (pluginName == 'owner' && !Utilities.isOwner(client, message.author.id)) {
					return;
				}
				const props = { command: commandName, prefix: prefix };
				client.plugins.get(pluginName).get(commandName).execute(message, args, client, props);
			} catch (error) {
				console.error(error);
				// TO-DO: Include attachments
				const errorMessage = `Error with \`${command}\` command used by \`${message.author.tag}\` in \`${message.guild.name}\`#\`${message.channel.name}\`:\n\`\`\`\n${message.cleanContent}\n\`\`\`\`\`\`\n${error}\n\`\`\``;
				client.channels.cache.get(config.debugChannel).send(errorMessage);
				message.reply('there was an error trying to execute that command!');
			}
		}
	}
	// Log DMs in case people are privately abusing the bot
	if (message.channel.type == 'dm') {
		// TO-DO: Include attachments
		client.channels.cache.get(config.logChannel).send(`Direct Message from \`${message.author.tag}\`:\n\`\`\`\n${message.content}\n\`\`\``);
	}
});

client.on('messageDelete', message => {
	if (!message.author.bot) {
		client.channels.cache.get(config.logChannel).send(`Message from \`${message.author.tag}\` in \`${message.guild.name}\`#\`${message.channel.name}\` was deleted:\n\`\`\`\n${message.cleanContent}\n\`\`\``);
	}
});

client.on('messageUpdate', (oldMessage, newMessage) => {
	if (!oldMessage.author.bot && oldMessage.content != newMessage.content) {
		client.channels.cache.get(config.logChannel).send(`Message from \`${oldMessage.author.tag}\` in \`${oldMessage.guild.name}\`#\`${oldMessage.channel.name}\` was edited\nOld Message:\n\`\`\`\n${oldMessage.cleanContent}\n\`\`\`New Message:\n\`\`\`\n${newMessage.cleanContent}\n\`\`\``);
	}
});

// Login to Discord with the app's token
client.login(credentials.discord_token);
