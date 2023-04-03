const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const YAML = require('yaml');
const fs = require('fs');
const createField = require('./createField.js');
const evalField = require('./evalField.js');
function componentToHex(c) {
	const hex = c.toString(16);
	return hex.length == 1 ? '0' + hex : hex;
}

module.exports = async function analyzeTimings(message, client, args) {
	const author = message.author ?? message.user;
	const TimingsEmbed = new EmbedBuilder()
		.setDescription('Estos no son valores mágicos. Muchas de estas configuraciones tienen consecuencias reales en la mecánica de tu servidor. Consulta [esta guía en inglés](https://eternity.community/index.php/paper-optimization/) para obtener información detallada sobre la funcionalidad de cada configuración.\n\nTambién puedes ver esta [serie de videos en español](https://www.youtube.com/playlist?list=PLXzwWvD3jl-s1P__FQnwZ3OujFilCJEQU) para conocer más acerca de estas configuraciones.')
		.setFooter({ text: `Solicitado por ${author.tag}`, iconURL: author.avatarURL() });

	let url;
	const fields = [];

	for (const arg of args) {
		if (message.commandName && arg.startsWith('https://spark.lucko.me')) {
			TimingsEmbed.addFields([{ name: '⚠️ Perfil de Spark', value: 'Este es un Perfil de Spark. Usa /perfil en su lugar para este tipo de informe.' }]);
			return [{ embeds: [TimingsEmbed] }];
		}
		if (arg.startsWith('https://timin') && arg.includes('?id=')) url = arg.replace('/d=', '/?id=').split('#')[0].split('\n')[0];
		if (arg.startsWith('https://www.spigotmc.org/go/timings?url=') || arg.startsWith('https://spigotmc.org/go/timings?url=')) {
			TimingsEmbed.addFields([{ name: '❌ Spigot', value: 'Los tiempos de Spigot tienen información limitada. Cambia a [Purpur](https://purpurmc.org) para obtener un mejor análisis de los tiempos. Todos tus plugins serán compatibles, y si no te gusta, puedes cambiar fácilmente de vuelta.' }])
				.setURL(url);
			return [{ embeds: [TimingsEmbed] }];
		}
	}

	if (!url) return null;

	// Start typing
	if (!message.commandName) await message.channel.sendTyping();

	client.logger.info(`Tiempos analizados desde ${author.tag} (${author.id}): ${url}`);

	const timings_host = url.split('?id=')[0];
	const timings_id = url.split('?id=')[1];

	const timings_json = timings_host + 'data.php?id=' + timings_id;
	const url_raw = url + '&raw=1';

	const response_raw = await fetch(url_raw);
	const request_raw = await response_raw.json();
	const response_json = await fetch(timings_json);
	const request = await response_json.json();

	if (!request_raw) {
		TimingsEmbed.setFields([{
			name: '❌ Error de Procesamiento',
			value: 'El bot no puede procesar este informe de tiempos. Por favor, utiliza un informe de tiempos alternativo.',
			inline: true,
		}]);
		TimingsEmbed.setColor(parseInt('0xff0000'));
		TimingsEmbed.setDescription(null);
		return [{ embeds: [TimingsEmbed] }];
	}


	const server_icon = timings_host + 'image.php?id=' + request_raw.icon;
	TimingsEmbed.setAuthor({ name: 'Analisis de Timings', iconURL: (server_icon ?? ''), url: url });

	if (!request_raw || !request) {
		TimingsEmbed.addFields([{ name: '❌ Reporte inválido', value: 'Crea un nuevo reporte de tiempos.', inline: true }]);
		return [{ embeds: [TimingsEmbed] }];
	}

	let version = request.timingsMaster.version;
	client.logger.info(version);

	if (version.endsWith('(MC: 1.17)')) version = version.replace('(MC: 1.17)', '(MC: 1.17.0)');

	let server_properties, bukkit, spigot, paper, pufferfish, purpur;

	const plugins = Object.keys(request.timingsMaster.plugins).map(i => { return request.timingsMaster.plugins[i]; });
	const configs = request.timingsMaster.config;
	if (configs) {
		if (configs['server.properties']) server_properties = configs['server.properties'];
		if (configs['bukkit']) bukkit = configs['bukkit'];
		if (configs['spigot']) spigot = configs['spigot'];
		if (configs['paper'] || configs['paperspigot']) paper = configs['paper'] ?? configs['paperspigot'];
		if (configs['pufferfish']) pufferfish = configs['pufferfish'];
		if (configs['purpur']) purpur = configs['purpur'];
	}

	const TIMINGS_CHECK = {
		servers: await YAML.parse(fs.readFileSync('./analysis_config/servers.yml', 'utf8')),
		plugins: {
			paper: await YAML.parse(fs.readFileSync('./analysis_config/plugins/paper.yml', 'utf8')),
			purpur: await YAML.parse(fs.readFileSync('./analysis_config/plugins/purpur.yml', 'utf8')),
		},
		config: {
			'server.properties': await YAML.parse(fs.readFileSync('./analysis_config/server.properties.yml', 'utf8')),
			bukkit: await YAML.parse(fs.readFileSync('./analysis_config/bukkit.yml', 'utf8')),
			spigot: await YAML.parse(fs.readFileSync('./analysis_config/spigot.yml', 'utf8')),
			paper: await YAML.parse(fs.readFileSync(`./analysis_config/timings/paper-v${paper._version ? 28 : 27}.yml`, 'utf8')),
			pufferfish: await YAML.parse(fs.readFileSync('./analysis_config/timings/pufferfish.yml', 'utf8')),
			purpur: await YAML.parse(fs.readFileSync('./analysis_config/purpur.yml', 'utf8')),
		},
	};

	const timing_cost = parseInt(request.timingsMaster.system.timingcost);
	if (timing_cost > 300) {
		fields.push({ name: '❌ Coste de tiempos', value: `Tu coste de tiempos es de ${timing_cost}. Tu CPU está sobrecargada y/o lenta. Encuentra un [mejor host](https://paper-chan.moe/paper-optimization/#Hosting-Options).`, inline: true });
	}

	// fetch the latest mc version
	const req = await fetch('https://api.purpurmc.org/v2/purpur');
	const json = await req.json();
	const latest = json.versions[json.versions.length - 1];

	// ghetto version check
	if (version.split('(MC: ')[1].split(')')[0] != latest) {
		version = version.replace('git-', '').replace('MC: ', '');
		fields.push({ name: '❌ Obsoleto', value: `Estás usando \`${version}\`. Actualiza a \`${latest}\`.`, inline: true });
	}

	if (TIMINGS_CHECK.servers) {
		TIMINGS_CHECK.servers.forEach(server => {
			if (version.includes(server.name)) fields.push(createField(server));
		});
	}

	const flags = request.timingsMaster.system.flags;
	const jvm_version = request.timingsMaster.system.jvmversion;
	if (flags.includes('-XX:+UseZGC') && flags.includes('-Xmx')) {
		const flaglist = flags.split(' ');
		flaglist.forEach(flag => {
			if (flag.startsWith('-Xmx')) {
				let max_mem = flag.split('-Xmx')[1];
				max_mem = max_mem.replace('G', '000');
				max_mem = max_mem.replace('M', '');
				max_mem = max_mem.replace('g', '000');
				max_mem = max_mem.replace('m', '');
				if (parseInt(max_mem) < 10000) fields.push({ name: '❌ Memoria Baja', value:'ZGC solo es bueno con mucha memoria.', inline: true });
			}
		});
	}
	else if (flags.includes('-Daikars.new.flags=true')) {
		if (!flags.includes('-XX:+PerfDisableSharedMem')) fields.push({ name: '❌ Flags obsoletas', value: 'Agrega `-XX:+PerfDisableSharedMem` a las flags.', inline: true });
		if (!flags.includes('-XX:G1MixedGCCountTarget=4')) fields.push({ name: '❌ Flags obsoletas', value: 'Agrega `XX:G1MixedGCCountTarget=4` a las flags.', inline: true });
		if (!flags.includes('-XX:+UseG1GC') && jvm_version.startsWith('1.8.')) fields.push({ name: '❌ Flags de Aikar', value: 'Debes usar G1GC al usar las flags de Aikar.', inline: true });
		if (flags.includes('-Xmx')) {
			let max_mem = 0;
			const flaglist = flags.split(' ');
			flaglist.forEach(flag => {
				if (flag.startsWith('-Xmx')) {
					max_mem = flag.split('-Xmx')[1];
					max_mem = max_mem.replace('G', '000');
					max_mem = max_mem.replace('M', '');
					max_mem = max_mem.replace('g', '000');
					max_mem = max_mem.replace('m', '');
				}
			});
			if (parseInt(max_mem) < 5400) fields.push({ name: '❌ Poca Memoria', value: 'Asigna al menos 6-10GB de RAM a tu servidor si te lo puedes permitir.', inline: true });
			let index = 0;
			let max_online_players = 0;
			while (index < request.timingsMaster.data.length) {
				const timed_ticks = request.timingsMaster.data[index].minuteReports[0].ticks.timedTicks;
				const player_ticks = request.timingsMaster.data[index].minuteReports[0].ticks.playerTicks;
				const players = (player_ticks / timed_ticks);
				max_online_players = Math.max(players, max_online_players);
				index = index + 1;
			}
			if (1000 * max_online_players / parseInt(max_mem) > 6 && parseInt(max_mem) < 10000) fields.push({ name: '❌ Poca Memoria', value: 'Deberías usar más RAM con esta cantidad de jugadores.', inline: true });
			if (flags.includes('-Xms')) {
				let min_mem = 0;
				flaglist.forEach(flag => {
					if (flag.startsWith('-Xmx')) {
						min_mem = flag.split('-Xmx')[1];
						min_mem = min_mem.replace('G', '000');
						min_mem = min_mem.replace('M', '');
						min_mem = min_mem.replace('g', '000');
						min_mem = min_mem.replace('m', '');
					}
				});
				if (min_mem != max_mem) fields.push({ name: '❌ Flags de Aikar', value: 'Los valores Xmx y Xms deberían ser iguales al usar las flags de Aikar.', inline: true });
			}
		}
	}
	else if (flags.includes('-Dusing.aikars.flags=mcflags.emc.gs')) {
		fields.push({ name: '❌ Outdated Flags', value: 'Actualiza las [flags de Aikar](https://aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft/).', inline: true });
	}
	else {
		fields.push({ name: '❌ Aikar\'s Flags', value: 'Usa las [flags de Aikar](https://aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft/).\n[Video explicativo aquí](https://youtu.be/32YCXG1sV4Y)', inline: true });
	}

	const cpu = parseInt(request.timingsMaster.system.cpu);
	if (cpu <= 2) fields.push({ name: '❌ Hilos', value: `Solo tienes ${cpu} hilo(s). Encuentra un [mejor host](https://www.birdflop.com).`, inline: true });

	const handlers = Object.keys(request_raw.idmap.handlers).map(i => { return request_raw.idmap.handlers[i]; });
	handlers.forEach(handler => {
		let handler_name = handler[1];
		if (handler_name.startsWith('Command Function - ') && handler_name.endsWith(':tick')) {
			handler_name = handler_name.split('Command Function - ')[1].split(':tick')[0];
			fields.push({ name: `❌ ${handler_name}`, value: 'Este datapack utiliza funciones de comando que son lentas.', inline: true });
		}
	});

	if (TIMINGS_CHECK.plugins) {
		Object.keys(TIMINGS_CHECK.plugins).forEach(server_name => {
			if (Object.keys(request.timingsMaster.config).includes(server_name)) {
				plugins.forEach(plugin => {
					Object.keys(TIMINGS_CHECK.plugins[server_name]).forEach(plugin_name => {
						if (plugin.name == plugin_name) {
							const stored_plugin = TIMINGS_CHECK.plugins[server_name][plugin_name];
							stored_plugin.name = plugin_name;
							fields.push(createField(stored_plugin));
						}
					});
				});
			}
		});
	}
	if (TIMINGS_CHECK.config) {
		Object.keys(TIMINGS_CHECK.config).map(i => { return TIMINGS_CHECK.config[i]; }).forEach(config => {
			Object.keys(config).forEach(option_name => {
				const option = config[option_name];
				evalField(fields, option, option_name, plugins, server_properties, bukkit, spigot, paper, pufferfish, purpur, client);
			});
		});
	}

	plugins.forEach(plugin => {
		if (plugin.authors && plugin.authors.toLowerCase().includes('songoda')) {
			if (plugin.name == 'EpicHeads') fields.push({ name: '❌ EpicHeads', value: 'Este plugin fue creado por Songoda. Songoda es sospechoso. Deberías buscar una alternativa como [HeadsPlus](https://spigotmc.org/resources/headsplus-»-1-8-1-16-4.40265/) o [HeadDatabase](https://www.spigotmc.org/resources/head-database.14280/).', inline: true });
			else if (plugin.name == 'UltimateStacker') fields.push({ name: '❌ UltimateStacker', value: 'Usar plugins de stacking de entidades en realidad causa más lag.\nElimina UltimateStacker.', inline: true });
			else fields.push({ name: `❌ ${plugin.name}`, value: 'Este plugin fue creado por Songoda. Songoda es sospechoso. Deberías buscar una alternativa.', inline: true });
		}
	});

	const worlds = request_raw.worlds ? Object.keys(request_raw.worlds).map(i => { return request_raw.worlds[i]; }) : [];
	let high_mec = false;
	worlds.forEach(world => {
		const max_entity_cramming = parseInt(world.gamerules.maxEntityCramming);
		if (max_entity_cramming >= 24) high_mec = true;
	});
	if (high_mec) fields.push({ name: '❌ maxEntityCramming', value: 'Disminuye esto ejecutando el comando `/gamerule` en cada mundo. Recomendado: 8.', inline: true });

	const normal_ticks = request.timingsMaster.data[0].totalTicks;
	let worst_tps = 20;
	request.timingsMaster.data.forEach(data => {
		const total_ticks = data.totalTicks;
		if (total_ticks == normal_ticks) {
			const end_time = data.end;
			const start_time = data.start;
			let tps;
			if (end_time == start_time) tps = 20;
			else tps = total_ticks / (end_time - start_time);
			if (tps < worst_tps) worst_tps = tps;
		}
	});
	let red = 0;
	let green = 0;
	if (worst_tps < 10) {
		red = 255;
		green = 255 * (0.1 * worst_tps);
	}
	else {
		red = 255 * (-0.1 * worst_tps + 2);
		green = 255;
	}

	TimingsEmbed.setColor(parseInt('0x' + componentToHex(Math.round(red)) + componentToHex(Math.round(green)) + '00'));

	if (timing_cost > 500) {
		const suggestions = fields.length - 1;
		TimingsEmbed.setColor(0xff0000).setDescription(null)
			.setFields([{ name: '❌ Timingcost (CRÍTICO)', value: `El costo de tiempo es ${timing_cost}. Este valor sería como máximo 200 en un servidor razonable. Su CPU está sobrecargada y/o es lenta. Ocultando ${suggestions} sugerencias comparativamente insignificantes hasta que resuelva este problema fundamental. Encuentra un [mejor host](https://paper-chan.moe/paper-optimization/#Hosting-Options).`, inline: true }]);
		return [{ embeds: [TimingsEmbed] }];
	}

	if (fields.length == 0) {
		TimingsEmbed.addFields([{ name: '✅ Todo bien', value: 'Analizado sin recomendaciones.' }]);
		return [{ embeds: [TimingsEmbed] }];
	}
	let components = [];
	const suggestions = [...fields];
	if (suggestions.length >= 13) {
		fields.splice(12, suggestions.length, { name: `Además de ${suggestions.length - 12} recomendaciones más`, value: 'Haz clic en los botones de abajo para ver más' });
		TimingsEmbed.setFooter({ text: `Solicitado por ${author.tag} • Página 1 de ${Math.ceil(suggestions.length / 12)}`, iconURL: author.avatarURL() });
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
	TimingsEmbed.addFields(fields);
	if (worst_tps >= 19) {
		TimingsEmbed.setFields([{ name: '✅ Tu servidor no está laggeando', value: `Tu servidor está funcionando bien con su TPS más bajo siendo de ${worst_tps}.` }]);
		components = [
			new ActionRowBuilder()
				.addComponents([
					new ButtonBuilder()
						.setCustomId('analysis_force')
						.setLabel('Descartar y forzar análisis')
						.setStyle(ButtonStyle.Secondary),
					new ButtonBuilder()
						.setURL('https://www.youtube.com/@ChasisTorcido')
						.setLabel('Más consejos para servidores')
						.setStyle(ButtonStyle.Link),
				]),
		];
	}
	return [{ embeds: [TimingsEmbed], components }, suggestions];
};
