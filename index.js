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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ================== CONFIG ==================
const DISPATCH_CHANNEL_ID         = "1465480815206076580";       // Panel-Channel
const MEDIC_CHANNEL_ID            = "1472065994808889437";       // Medic Einsätze
const WERKSTATT_CHANNEL_ID        = "1472067191238295745";       // Werkstatt Einsätze
const MEDIC_STATUS_CHANNEL_ID     = "1472068510057369640";       // Status-Channel Medic
const WERKSTATT_STATUS_CHANNEL_ID = "1472068399709552781";       // Status-Channel Werkstatt
const MEDIC_ROLE_ID               = "1466617210691653785";       // Medic Rolle
const WERKSTATT_ROLE_ID           = "1472067368665485415";       // Werkstatt Rolle

// ================== MAPS ==================
let offeneEinsaetze = { werkstatt: null, medic: null };
let medicStatus     = [];
let werkstattStatus = [];

// ================== READY ==================
client.once('ready', async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);

  // --- Dispatch Panel ---
  const panelChannel = await client.channels.fetch(DISPATCH_CHANNEL_ID);
  const messages = await panelChannel.messages.fetch({ limit: 10 });
  if (!messages.some(m => m.author.id === client.user.id && m.components.length)) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("werkstatt").setLabel("🛠 Werkstatt rufen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("medic").setLabel("🚑 Medic rufen").setStyle(ButtonStyle.Success)
      );
    await panelChannel.send({ content: "📡 **DISPATCH SYSTEM**\nKlicke auf deine Fraktion:", components: [row] });
  }

  // --- Status Channels ---
  await updateDispatchStatus();
});

// ================== STATUS UPDATE ==================
async function updateDispatchStatus() {
  const medicChannel = await client.channels.fetch(MEDIC_STATUS_CHANNEL_ID);
  const werkstattChannel = await client.channels.fetch(WERKSTATT_STATUS_CHANNEL_ID);

  const medicEmbed = new EmbedBuilder()
    .setTitle("🚑 Medic Status")
    .setDescription(medicStatus.length > 0 ? medicStatus.map(id => `<@${id}>`).join("\n") : "Niemand eingestempelt")
    .setColor("Green");

  const werkstattEmbed = new EmbedBuilder()
    .setTitle("🛠 Werkstatt Status")
    .setDescription(werkstattStatus.length > 0 ? werkstattStatus.map(id => `<@${id}>`).join("\n") : "Niemand eingestempelt")
    .setColor("Blue");

  // Medic Embed posten oder editieren
  const medicMessages = await medicChannel.messages.fetch({ limit: 10 });
  const medicBotMsg = medicMessages.find(m => m.author.id === client.user.id);
  if (medicBotMsg) await medicBotMsg.edit({ embeds: [medicEmbed] });
  else {
    const rowMedic = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("medic_in").setLabel("✅ Einstempeln").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("medic_out").setLabel("❌ Ausstempeln").setStyle(ButtonStyle.Danger)
      );
    await medicChannel.send({ content: "**Medic Status**", embeds: [medicEmbed], components: [rowMedic] });
  }

  // Werkstatt Embed posten oder editieren
  const werkstattMessages = await werkstattChannel.messages.fetch({ limit: 10 });
  const werkstattBotMsg = werkstattMessages.find(m => m.author.id === client.user.id);
  if (werkstattBotMsg) await werkstattBotMsg.edit({ embeds: [werkstattEmbed] });
  else {
    const rowWerkstatt = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("werkstatt_in").setLabel("✅ Einstempeln").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("werkstatt_out").setLabel("❌ Ausstempeln").setStyle(ButtonStyle.Danger)
      );
    await werkstattChannel.send({ content: "**Werkstatt Status**", embeds: [werkstattEmbed], components: [rowWerkstatt] });
  }
}

// ================== INTERACTIONS ==================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const user = interaction.user;
  const member = interaction.member;

  // ===== PANEL BUTTONS =====
  if (interaction.customId === "werkstatt" || interaction.customId === "medic") {
    const fraktion = interaction.customId;
    await interaction.reply({ content: "✏️ Bitte gib jetzt den **Ort / Beschreibung** ein (60s):", ephemeral: true });

    const filter = m => m.author.id === user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async m => {
      const ortBeschreibung = m.content;
      await m.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${fraktion.charAt(0).toUpperCase() + fraktion.slice(1)} Einsatz`)
        .setDescription(`Einsatz von: ${user}\nStatus: 🟡 Offen\nOrt / Beschreibung: ${ortBeschreibung}`)
        .setColor("Red");

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId(`annehmen_${fraktion}`).setLabel("✅ Einsatz annehmen").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`update_${fraktion}`).setLabel("✏️ Status / Ort eintragen").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`close_${fraktion}`).setLabel("🔒 Einsatz schließen").setStyle(ButtonStyle.Danger)
        );

      const zielChannel = fraktion === "werkstatt" ? await client.channels.fetch(WERKSTATT_CHANNEL_ID)
                                                   : await client.channels.fetch(MEDIC_CHANNEL_ID);

      const msg = await zielChannel.send({ embeds: [embed], components: [row] });
      offeneEinsaetze[fraktion] = { message: msg, angenommenVon: null, updates: [] };

      await interaction.followUp({ content: `✅ Einsatz für ${fraktion} erstellt!`, ephemeral: true });
    });

    collector.on('end', collected => {
      if (collected.size === 0)
        interaction.followUp({ content: "❌ Keine Eingabe. Einsatz abgebrochen.", ephemeral: true });
    });
    return;
  }

  // ===== STATUS BUTTONS MIT ROLLEN =====
  if (["medic_in","medic_out","werkstatt_in","werkstatt_out"].includes(interaction.customId)) {
    let statusArray = interaction.customId.startsWith("medic") ? medicStatus : werkstattStatus;
    let roleId = interaction.customId.startsWith("medic") ? MEDIC_ROLE_ID : WERKSTATT_ROLE_ID;

    if (interaction.customId.endsWith("in")) {
        if (!statusArray.includes(member.id)) {
            statusArray.push(member.id);
            try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) await member.roles.add(role);
            } catch (err) { console.error("Rollen hinzufügen fehlgeschlagen:", err); }
        }
    } else {
        statusArray = statusArray.filter(id => id !== member.id);
        try {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) await member.roles.remove(role);
        } catch (err) { console.error("Rollen entfernen fehlgeschlagen:", err); }
    }

    if (interaction.customId.startsWith("medic")) medicStatus = statusArray;
    else werkstattStatus = statusArray;

    await updateDispatchStatus();
    return interaction.reply({ content: "✅ Status aktualisiert!", ephemeral: true });
  }

  // ===== EINSATZ BUTTONS =====
  const parts = interaction.customId.split("_");
  if (parts.length < 2) return;
  const action = parts[0];
  const fraktion = parts[1];
  const einsatz = offeneEinsaetze[fraktion];
  if (!einsatz) return interaction.reply({ content: `❌ Kein aktiver Einsatz für ${fraktion}`, ephemeral: true });

  const embed = EmbedBuilder.from(einsatz.message.embeds[0]);

  if (action === "annehmen") {
    if (einsatz.angenommenVon)
      return interaction.reply({ content: `❌ Bereits übernommen von <@${einsatz.angenommenVon}>!`, ephemeral: true });

    einsatz.angenommenVon = user.id;
    embed.setDescription(embed.data.description + `\nÜbernommen von: <@${user.id}>\nStatus: 🟢 Unterwegs`);
    embed.setColor("Green");

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`verstärkung_${fraktion}`).setLabel("⚠️ Verstärkung benötigt").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`update_${fraktion}`).setLabel("✏️ Status / Ort eintragen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_${fraktion}`).setLabel("🔒 Einsatz schließen").setStyle(ButtonStyle.Secondary)
      );

    await einsatz.message.edit({ embeds: [embed], components: [row] });
    return interaction.reply({ content: `✅ Einsatz übernommen!`, ephemeral: true });
  }

  if (action === "update") {
    await interaction.reply({ content: "Schreibe Status / Ort:", ephemeral: true });
    const filter = m => m.author.id === user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async m => {
      einsatz.updates.push(`<@${user.id}>: ${m.content}`);
      embed.setDescription(embed.data.description.split("\n").filter(line => !line.startsWith("Update:")).join("\n") + "\n" + einsatz.updates.join("\n"));
      await einsatz.message.edit({ embeds: [embed] });
      await m.delete().catch(() => {});
      await interaction.followUp({ content: "✅ Status aktualisiert!", ephemeral: true });
    });
  }

  if (action === "close") {
    await einsatz.message.edit({ content: `✔️ Einsatz abgeschlossen`, embeds: [] });
    offeneEinsaetze[fraktion] = null;
    return interaction.reply({ content: `🔒 Einsatz für ${fraktion} geschlossen`, ephemeral: true });
  }

  if (action === "verstärkung") {
    const zielChannel = fraktion === "medic" ? 
        await client.channels.fetch(MEDIC_CHANNEL_ID) : 
        await client.channels.fetch(WERKSTATT_CHANNEL_ID);

    // Rolle taggen damit alle es sehen
    const roleId = fraktion === "medic" ? MEDIC_ROLE_ID : WERKSTATT_ROLE_ID;
    await zielChannel.send({ content: `<@&${roleId}> ⚠️ Verstärkung benötigt!\nEinsatz von: <@${einsatz.angenommenVon}>\nOrt / Beschreibung:\n${embed.data.description.split("\n").slice(2).join("\n")}` });
    return interaction.reply({ content: "✅ Verstärkung angefordert!", ephemeral: true });
  }
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);

