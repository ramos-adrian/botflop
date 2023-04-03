const analyzeTimings = require('../functions/analyzeTimings.js');
const { EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
	name: 'timings',
	description: 'Analiza los tiempos de Paper para ayudar a optimizar tu servidor.',
	args: true,
	usage: '<Enlace de Timings>',
	options: [{
		'type': ApplicationCommandOptionType.String,
		'name': 'url',
		'description': 'El enlace de Timings',
		'required': true,
	}],
	async execute(message, args, client) {
		try {
			const timingsresult = await analyzeTimings(message, client, args);
			const timingsmsg = await message.reply(timingsresult ? timingsresult[0] : 'Enlace de Timings inválido.');
			if (!timingsresult) return;

			// Obtener los problemas del resultado de Timings
			const suggestions = timingsresult[1];
			if (!suggestions) return;
			const filter = i => i.user.id == (message.author ?? message.user).id && i.customId.startsWith('analysis_');
			const collector = timingsmsg.createMessageComponentCollector({ filter, time: 300000 });
			collector.on('collect', async i => {
				// Deferir botón
				await i.deferUpdate();

				// Obtener el embed
				const TimingsEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
				const footer = TimingsEmbed.toJSON().footer;

				// Forzar botón de análisis
				if (i.customId == 'analysis_force') {
					const fields = [...suggestions];
					const components = [];
					if (suggestions.length >= 13) {
						fields.splice(12, suggestions.length, { name: '✅ Tu servidor no está retrasado', value: `**Además de ${suggestions.length - 12} recomendaciones más**\nHaz clic en los botones de abajo para ver más` });
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
					TimingsEmbed.setFields(fields);

					// Enviar el embed
					return i.editReply({ embeds: [TimingsEmbed], components });
				}

				// Calcular el número total de páginas y obtener la página actual del pie de página del embed
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
				TimingsEmbed
					.setFields(fields)
					.setFooter({ iconURL: footer.icon_url, text: text.join(' • ') });

				// Send the embed
				i.editReply({ embeds: [TimingsEmbed] });
			});

			// Cuando el recolector se detiene, elimina todos los botones del mensaje
			collector.on('end', () => {
				if (message.commandName) message.editReply({ components: [] }).catch(err => client.logger.warn(err));
				else timingsmsg.edit({ components: [] }).catch(err => client.logger.warn(err));
			});
		}
		catch (err) { client.error(err, message); }
	},
};
