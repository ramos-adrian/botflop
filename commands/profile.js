const analyzeProfile = require('../functions/analyzeProfile.js');
const { EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
	name: 'profile',
	description: 'Analiza perfiles de Spark para ayudar a optimizar tu servidor.',
	args: true,
	usage: '<Enlace del perfil de Spark>',
	options: [{
		'type': ApplicationCommandOptionType.String,
		'name': 'url',
		'description': 'El enlace del perfil de Spark',
		'required': true,
	}],
	async execute(message, args, client) {
		try {
			const profileresult = await analyzeProfile(message, client, args);
			const profilemsg = await message.reply(profileresult ? profileresult[0] : 'Enlace del perfil inválido.');
			if (!profileresult) return;

			// Obtener los problemas del resultado del perfil
			const suggestions = profileresult[1];
			if (!suggestions) return;
			const filter = i => i.user.id == (message.author ?? message.user).id && i.customId.startsWith('analysis_');
			const collector = profilemsg.createMessageComponentCollector({ filter, time: 300000 });
			collector.on('collect', async i => {
				// Defer button
				await i.deferUpdate();

				// Obtener el embed
				const ProfileEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
				const footer = ProfileEmbed.toJSON().footer;

				// Botón de análisis forzado
				if (i.customId == 'analysis_force') {
					const fields = [...suggestions];
					const components = [];
					if (suggestions.length >= 13) {
						fields.splice(12, suggestions.length, { name: '✅ Tu servidor no tiene lag', value: `**Más ${suggestions.length - 12} recomendaciones**\nHaz clic en los botones de abajo para ver más` });
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
										.setURL('https://www.youtube.com/@ChasisTorcido')
										.setLabel('Más consejos para servidores')
										.setStyle(ButtonStyle.Link),
								]),
						);
					}
					ProfileEmbed.setFields(fields);

					// Enviar el embed
					return i.editReply({ embeds: [ProfileEmbed], components });
				}

				// Calcular la cantidad total de páginas y obtener la página actual del pie de página del embed
				const text = footer.text.split(' • ');
				const lastPage = parseInt(text[text.length - 1].split('Página ')[1].split(' ')[0]);
				const maxPages = parseInt(text[text.length - 1].split('Página ')[1].split(' ')[2]);

				// Obtener la siguiente página (si es la última página, ir a la pg 1)
				const page = i.customId == 'analysis_next' ? lastPage == maxPages ? 1 : lastPage + 1 : lastPage - 1 ? lastPage - 1 : maxPages;
				const end = page * 12;
				const start = end - 12;
				
				const fields = suggestions.slice(start, end);

				// Update the embed
				text[text.length - 1] = `Página ${page} de ${Math.ceil(suggestions.length / 12)}`;
				ProfileEmbed
					.setFields(fields)
					.setFooter({ iconURL: footer.icon_url, text: text.join(' • ') });

				// Send the embed
				i.editReply({ embeds: [ProfileEmbed] });
			});

			// When the collector stops, remove all buttons from it
			collector.on('end', () => {
				if (message.commandName) message.editReply({ components: [] }).catch(err => client.logger.warn(err));
				else profilemsg.edit({ components: [] }).catch(err => client.logger.warn(err));
			});
		}
		catch (err) { client.error(err, message); }
	},
};
