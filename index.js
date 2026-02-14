const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- CHANNEL IDS ---
const DISPATCH_CHANNEL_ID = "1465480815206076580";      
const MEDIC_CHANNEL_ID = "1472065994808889437";   
const WERKSTATT_CHANNEL_ID = "1472067191238295745"; 
const MEDIC_STATUS_CHANNEL_ID = "1472068510057369640";    
const WERKSTATT_STATUS_CHANNEL_ID = "1472068399709552781";

// --- Einsätze & Status ---
let offeneEinsaetze = { werkstatt: null, medic: null };
let medicStatus = [];
let werkstattStatus = [];

client.once('ready', async () => {
  console.log(`Bot online als ${client.user.tag}`);

  // --- PANEL CHANNEL ---
  const panelChannel = await client.channels.fetch(DISPATCH_CHANNEL_ID);
  const messages = await panelChannel.messages.fetch({ limit: 10 });
  const panelExists = messages.some(m => m.author.id === client.user.id && m.components.length);

  if (!panelExists) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("werkstatt").setLabel("🛠 Werkstatt rufen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("medic").setLabel("🚑 Medic rufen").setStyle(ButtonStyle.Success)
      );
    await panelChannel.send({ content: "📡 **DISPATCH SYSTEM**\nKlicke auf deine Fraktion:", components: [row] });
  }

  // --- STATUS CHANNELS ---
  const medicChannel = await client.channels.fetch(MEDIC_STATUS_CHANNEL_ID);
  const werkstattChannel = await client.channels.fetch(WERKSTATT_STATUS_CHANNEL_ID);

  const rowMedic = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId("medic_in").setLabel("✅ Einstempeln").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("medic_out").setLabel("❌ Ausstempeln").setStyle(ButtonStyle.Danger)
    );

  const rowWerkstatt = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId("werkstatt_in").setLabel("✅ Einstempeln").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("werkstatt_out").setLabel("❌ Ausstempeln").setStyle(ButtonStyle.Danger)
    );

  // Poste Status-Embeds nur, falls noch nicht vorhanden
  const medicMsgs = await medicChannel.messages.fetch({ limit: 10 });
  if (!medicMsgs.some(m => m.author.id === client.user.id)) {
    await medicChannel.send({ content: "**Medic Status**", components: [rowMedic] });
  }

  const werkstattMsgs = await werkstattChannel.messages.fetch({ limit: 10 });
  if (!werkstattMsgs.some(m => m.author.id === client.user.id)) {
    await werkstattChannel.send({ content: "**Werkstatt Status**", components: [rowWerkstatt] });
  }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const user = interaction.user;

  // --- PANEL BUTTONS ---
  if (interaction.customId === "werkstatt" || interaction.customId === "medic") {
    const fraktion = interaction.customId;

    let zielChannel = fraktion === "werkstatt" ? await client.channels.fetch(WERKSTATT_CHANNEL_ID)
                                              : await client.channels.fetch(MEDIC_CHANNEL_ID);

    if (offeneEinsaetze[fraktion]) {
      return interaction.reply({ content: `❌ Ein Einsatz für ${fraktion} läuft bereits!`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🚨 ${fraktion.charAt(0).toUpperCase() + fraktion.slice(1)} Einsatz`)
      .setDescription(`Einsatz von: ${user}\nStatus: 🟡 Offen\nOrt / Beschreibung: -`)
      .setColor("Red");

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`annehmen_${fraktion}`).setLabel("✅ Einsatz annehmen").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`update_${fraktion}`).setLabel("✏️ Status / Ort eintragen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_${fraktion}`).setLabel("🔒 Einsatz schließen").setStyle(ButtonStyle.Danger)
      );

    const msg = await zielChannel.send({ embeds: [embed], components: [row] });
    offeneEinsaetze[fraktion] = { message: msg, angenommenVon: null };

    return interaction.reply({ content: `✅ Einsatz für ${fraktion} erstellt!`, ephemeral: true });
  }

  // --- EIN-/AUSSTEMPELN STATUS ---
  if (["medic_in","medic_out","werkstatt_in","werkstatt_out"].includes(interaction.customId)) {
    let statusArray = interaction.customId.startsWith("medic") ? medicStatus : werkstattStatus;
    let statusChannel = interaction.customId.startsWith("medic") ? await client.channels.fetch(MEDIC_STATUS_CHANNEL_ID)
                                                                  : await client.channels.fetch(WERKSTATT_STATUS_CHANNEL_ID);

    if (interaction.customId.endsWith("in")) {
      if (!statusArray.includes(user.id)) statusArray.push(user.id);
    } else {
      statusArray = statusArray.filter(id => id !== user.id);
    }

    if (interaction.customId.startsWith("medic")) medicStatus = statusArray;
    else werkstattStatus = statusArray;

    const embed = new EmbedBuilder()
      .setTitle(interaction.customId.startsWith("medic") ? "🚑 Medic Status" : "🛠 Werkstatt Status")
      .setDescription(statusArray.length > 0 ? statusArray.map(id => `<@${id}>`).join("\n") : "Niemand eingestempelt")
      .setColor(interaction.customId.startsWith("medic") ? "Green" : "Blue");

    const messages = await statusChannel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ embeds: [embed] });

    return interaction.reply({ content: "✅ Status aktualisiert!", ephemeral: true });
  }

  // --- EINSATZ BUTTONS ---
  const parts = interaction.customId.split("_");
  if (parts.length < 2) return;
  const action = parts[0];
  const fraktion = parts[1];
  const einsatz = offeneEinsaetze[fraktion];
  if (!einsatz) return interaction.reply({ content: `❌ Kein aktiver Einsatz für ${fraktion}`, ephemeral: true });

  const embed = EmbedBuilder.from(einsatz.message.embeds[0]);

  if (action === "annehmen") {
    if (einsatz.angenommenVon) {
      return interaction.reply({ content: `❌ Einsatz wurde bereits übernommen von <@${einsatz.angenommenVon}>!`, ephemeral: true });
    }
    einsatz.angenommenVon = user.id;
    embed.setDescription(`Einsatz von: ${einsatz.message.author}\nÜbernommen von: ${user}\nStatus: 🟢 Unterwegs\nOrt / Beschreibung: -`);
    embed.setColor("Green");
    await einsatz.message.edit({ embeds: [embed] });
    return interaction.reply({ content: `✅ Du hast den Einsatz übernommen!`, ephemeral: true });
  }

  if (action === "update") {
    await interaction.reply({ content: "Schreibe jetzt in den Chat deinen Status / Ort für den Einsatz:", ephemeral: true });
    const filter = m => m.author.id === user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async m => {
      embed.setDescription(`Einsatz von: ${einsatz.message.author}\nÜbernommen von: <@${einsatz.angenommenVon || "-"}>\nStatus: 🟢 Unterwegs\nOrt / Beschreibung: ${m.content}`);
      await einsatz.message.edit({ embeds: [embed] });
      await m.delete().catch(() => {});
      await interaction.followUp({ content: `✅ Status aktualisiert!`, ephemeral: true });
    });
  }

  if (action === "close") {
    await einsatz.message.edit({ content: `✔️ Einsatz abgeschlossen`, embeds: [] });
    offeneEinsaetze[fraktion] = null;
    return interaction.reply({ content: `🔒 Einsatz für ${fraktion} geschlossen`, ephemeral: true });
  }
});

client.login(process.env.TOKEN);

