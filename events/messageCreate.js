const analyzeTimings = require('../functions/analyzeTimings');
const analyzeProfile = require('../functions/analyzeProfile');
const { createPaste } = require('hastebin');
const fetch = (...args) => import('node-fetch').then(({ default: e }) => e(...args));
const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = async (cliente, mensaje) => {
	if (mensaje.author.bot) return;

	// Si el bot no puede leer el historial de mensajes o enviar mensajes, no ejecuta un comando
	if (mensaje.guild && (!mensaje.guild.members.me.permissionsIn(mensaje.channel).has(PermissionsBitField.Flags.SendMessages) || !mensaje.guild.members.me.permissionsIn(mensaje.channel).has(PermissionsBitField.Flags.ReadMessageHistory))) return;

	// hacer una función personalizada para reemplazar message.reply
	// esto es para enviar el mensaje al canal sin una respuesta si falla la respuesta
	mensaje.msgreply = mensaje.reply;
	mensaje.reply = function reply(objeto) {
		return mensaje.msgreply(objeto).catch(err => {
			cliente.logger.warn(err);
			return mensaje.channel.send(objeto).catch(err => {
				cliente.logger.error(err.stack);
			});
		});
	};

	// Obtener el prefijo
	let prefijo = process.env.PREFIX;

	try {
		// Binflop
		if (mensaje.attachments.size > 0) {
			const url = mensaje.attachments.first().url;
			const tiposArchivo = ['.log', '.txt', '.json', '.yml', '.yaml', '.css', '.py', '.js', '.sh', '.config', '.conf'];
			if (!url.endsWith('.html')) {
				if (!mensaje.attachments.first().contentType) return;
				const tipoArchivo = mensaje.attachments.first().contentType.split('/')[0];
				if (tiposArchivo.some(ext => url.endsWith(ext)) || tipoArchivo == 'text') {
					// Empezar a escribir
					await mensaje.channel.sendTyping();

					// obtener el archivo de la URL externa
					const res = await fetch(url);
					
					// Toma el flujo de respuesta y léelo hasta completarlo
					let text = await res.text();

					let truncated = false;
					if (text.length > 100000) {
						text = text.substring(0, 100000);
						truncated = true;
					}

					let response = await createPaste(text, { server: 'https://bin.birdflop.com' });
					if (truncated) response = response + '\n(el archivo fue truncado porque era demasiado largo)';

					const PasteEmbed = new EmbedBuilder()
						.setTitle('Por favor utiliza un servicio de pegado')
						.setColor(0x1D83D4)
						.setDescription(response)
						.setFooter({ text: `Solicitado por ${message.author.tag}`, iconURL: message.author.avatarURL() });
					await message.channel.send({ embeds: [PasteEmbed] });
					client.logger.info(`Archivo subido por ${message.author.tag} (${message.author.id}): ${response}`);
				}
			}
		}

		// Pastebin está bloqueado en algunos países
		const words = message.content.replace(/\n/g, ' ').split(' ');
		for (const word of words) {
			if (word.startsWith('https://pastebin.com/') && word.length == 29) {
				// Comenzar a escribir
				await message.channel.sendTyping();

				const key = word.split('/')[3];
				const res = await fetch(`https://pastebin.com/raw/${key}`);
				let text = await res.text();

				let truncated = false;
				if (text.length > 100000) {
					text = text.substring(0, 100000);
					truncated = true;
				}

				let response = await createPaste(text, { server: 'https://bin.birdflop.com' });
				if (truncated) response = response + '\n(el archivo fue truncado porque era demasiado largo)';

				const PasteEmbed = new EmbedBuilder()
					.setTitle('Pastebin está bloqueado en algunos países')
					.setColor(0x1D83D4)
					.setDescription(response)
					.setFooter({ text: `Solicitado por ${message.author.tag}`, iconURL: message.author.avatarURL() });
				await message.channel.send({ embeds: [PasteEmbed] });
				client.logger.info(`Pastebin convertido por ${message.author.tag} (${message.author.id}): ${response}`);
			}
		}


		// Use mention as prefix instead of prefix too
		if (message.content.replace('!', '').startsWith(`<@${client.user.id}>`)) prefix = message.content.split('>')[0] + '>';

		// If the message doesn't start with the prefix (mention not included), check for timings/profile report
		if (!message.content.startsWith(process.env.PREFIX)) {
			const analysisresult = await analyzeTimings(message, client, words) ?? await analyzeProfile(message, client, words);
			if (analysisresult) {
				const analysismsg = await message.reply(analysisresult[0]);

				// Get the issues from the analysis result
				const issues = analysisresult[1];
				if (issues) {
					const filter = i => i.user.id == message.author.id && i.customId.startsWith('analysis_');
					const collector = analysismsg.createMessageComponentCollector({ filter, time: 300000 });
					collector.on('collect', async i => {
						// Defer button
						i.deferUpdate();

						// Get the embed
						const AnalysisEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
						const footer = AnalysisEmbed.toJSON().footer;

						// Force analysis button
						if (i.customId == 'analysis_force') {
							const fields = [...issues];
							const components = [];
							if (issues.length >= 13) {
								fields.splice(12, issues.length, { name: '✅ Su servidor no está con lag', value: `**Además de ${issues.length - 12} recomendaciones más**\nHaga clic en los botones de abajo para ver más` });
								components.push(
									new ActionRowBuilder()
										.addComponents([
											new ButtonBuilder()
												.setCustomId('analysis_prev')
												.setEmoji({ name: '⬅️' })
												.setStyle(ButtonStyle.Secondary),
											new ButtonBuilder()
												.setCustomId('analysis_next')
												.setEmoji({ name: '➡️' })
												.setStyle(ButtonStyle.Secondary),
											new ButtonBuilder()
												.setURL('https://github.com/pemigrade/botflop')
												.setLabel('Botflop')
												.setStyle(ButtonStyle.Link),
										]),
								);
							}
							AnalysisEmbed.setFields(fields);


							// Send the embed
							return analysismsg.edit({ embeds: [AnalysisEmbed], components });
						}

						// Calculate total amount of pages and get current page from embed footer
						const text = footer.text.split(' • ');
						const lastPage = parseInt(text[text.length - 1].split('Página ')[1].split(' ')[0]);
						const maxPages = parseInt(text[text.length - 1].split('Página ')[1].split(' ')[2]);

						// Get next page (if last page, go to pg 1)
						const page = i.customId == 'analysis_next' ? lastPage == maxPages ? 1 : lastPage + 1 : lastPage - 1 ? lastPage - 1 : maxPages;
						const end = page * 12;
						const start = end - 12;
						const fields = issues.slice(start, end);

						// Update the embed
						text[text.length - 1] = `Página ${page} de ${Math.ceil(issues.length / 12)}`;
						AnalysisEmbed
							.setFields(fields)
							.setFooter({ iconURL: footer.iconURL, text: text.join(' • ') });

						// Send the embed
						analysismsg.edit({ embeds: [AnalysisEmbed] });
					});
				}
			}
		}
	}
	catch (err) {
		client.logger.error(err.stack);
	}

	// If message doesn't start with the prefix, if so, return
	if (!message.content.startsWith(prefix)) return;

	// Get args by splitting the message by the spaces and getting rid of the prefix
	const args = message.content.slice(prefix.length).trim().split(/ +/);

	// Get the command name from the fist arg and get rid of the first arg
	const commandName = args.shift().toLowerCase();

	// Get the command from the commandName, if it doesn't exist, return
	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

	// If the command doesn't exist, find timings report
	if (!command || !command.name) return;

	// Start typing (basically to mimic the defer of interactions)
	await message.channel.sendTyping();

	// Check if args are required and see if args are there, if not, send error
	if (command.args && args.length < 1) {
		const Usage = new EmbedBuilder()
			.setColor(0x5662f6)
			.setTitle('Uso')
			.setDescription(`\`${prefix + command.name + ' ' + command.usage}\``);
		return message.reply({ embeds: [Usage] });
	}

	// execute the command
	try {
		client.logger.info(`${message.author.tag} issued message command: ${message.content}, in ${message.guild.name}`);
		command.execute(message, args, client);
	}
	catch (err) {
		const interactionFailed = new EmbedBuilder()
			.setColor('Random')
			.setTitle('INTERACTION FAILED')
			.setAuthor({ name: message.author.tag, iconURL: message.author.avatarURL() })
			.addFields([
				{ name: '**Type:**', value: 'Message' },
				{ name: '**Guild:**', value: message.guild.name },
				{ name: '**Channel:**', value: message.channel.name },
				{ name: '**INTERACTION:**', value: prefix + command.name },
				{ name: '**Error:**', value: `\`\`\`\n${err}\n\`\`\`` }]);
		client.guilds.cache.get('811354612547190794').channels.cache.get('830013224753561630').send({ content: '<@&839158574138523689>', embeds: [interactionFailed] });
		message.author.send({ embeds: [interactionFailed] }).catch(err => client.logger.warn(err));
		client.logger.error(err.stack);
	}
};
