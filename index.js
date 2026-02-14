const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let einsatzNummer = 1;
let offeneEinsaetze = new Map();

client.once('ready', async () => {
  console.log(`Bot online als ${client.user.tag}`);

  const channel = await client.channels.fetch("1465480815206076580");

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("werkstatt")
        .setLabel("🛠 Werkstatt rufen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("medic")
        .setLabel("🚑 Medic rufen")
        .setStyle(ButtonStyle.Success)
    );

  await channel.send({
    content: "📡 **DISPATCH SYSTEM**\nWähle eine Fraktion:",
    components: [row]
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;

  const werkstattRole = guild.roles.cache.find(r => r.name === "Werkstatt");
  const medicRole = guild.roles.cache.find(r => r.name === "Medic");

  // ================================
  // DISPATCH ERSTELLEN
  // ================================
  if (interaction.customId === "werkstatt" || interaction.customId === "medic") {

    const role = interaction.customId === "werkstatt" ? werkstattRole : medicRole;
    const type = interaction.customId === "werkstatt" ? "Werkstatt" : "Medic";

    const channel = await guild.channels.create({
      name: `einsatz-${einsatzNummer}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: role.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle(`🚨 Neuer ${type} Einsatz`)
      .setDescription(
        `Einsatznummer: #${einsatzNummer}\n` +
        `Angefordert von: ${interaction.user}\n\n` +
        `Status: 🟡 Offen`
      )
      .setColor("Red");

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("annehmen")
          .setLabel("✅ Einsatz annehmen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("close")
          .setLabel("🔒 Einsatz schließen")
          .setStyle(ButtonStyle.Danger)
      );

    await channel.send({ embeds: [embed], components: [row] });

    offeneEinsaetze.set(channel.id, {
      angenommenVon: null
    });

    einsatzNummer++;

    await interaction.reply({
      content: "✅ Dispatch wurde erstellt!",
      ephemeral: true
    });
  }

  // ================================
  // EINSATZ ANNEHMEN
  // ================================
  if (interaction.customId === "annehmen") {

    const einsatz = offeneEinsaetze.get(interaction.channel.id);
    if (!einsatz) return;

    if (einsatz.angenommenVon) {
      return interaction.reply({
        content: "❌ Dieser Einsatz wurde bereits übernommen!",
        ephemeral: true
      });
    }

    einsatz.angenommenVon = interaction.user.id;

    const embed = new EmbedBuilder()
      .setTitle("🚑 Einsatz übernommen")
      .setDescription(
        `Übernommen von: ${interaction.user}\n\n` +
        `Status: 🟢 Unterwegs`
      )
      .setColor("Green");

    const disabledRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("annehmen")
          .setLabel("Bereits übernommen")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("close")
          .setLabel("🔒 Einsatz schließen")
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.update({
      embeds: [embed],
      components: [disabledRow]
    });
  }

  // ================================
  // EINSATZ SCHLIESSEN
  // ================================
  if (interaction.customId === "close") {

    await interaction.reply({
      content: "🔒 Einsatz wird geschlossen...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);
  }
});

client.login(process.env.TOKEN);
