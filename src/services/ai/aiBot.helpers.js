function getMessageText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

function getGroupTriggerInfo({
  message,
  messageText,
  mentions,
  myJid,
  myLid,
  myNumber,
  myLidBase,
  displayName,
  allowMention = true,
  allowReply = true,
  allowKeyword = true,
}) {
  // Broad ContextInfo extraction (works for text and media replies)
  const contextInfo =
    message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo ||
    message?.audioMessage?.contextInfo ||
    {};

  const quotedParticipant = contextInfo.participant || "";
  const quotedBase = quotedParticipant.split(":")[0].split("@")[0];

  // Check if message is a reply to the bot itself (Compare base IDs to skip device suffixes)
  const isReplyToMe =
    quotedBase &&
    (quotedBase === myNumber || (myLidBase && quotedBase === myLidBase));

  const lowerText = (messageText || "").toLowerCase();

  // Check for keywords anywhere (ai, bot, or display name)
  const triggerWords = ["ai", "bot"];
  if (displayName) triggerWords.push(displayName.toLowerCase());
  const keywordRegex = new RegExp(`\\b(${triggerWords.join("|")})\\b`, "i");
  const hasKeyword = keywordRegex.test(lowerText);

  // Check if bot is mentioned via official mention (JID/LID), text "@number", or text "@displayName"
  const isMentioned =
    mentions.includes(myJid) ||
    (myLid && mentions.includes(myLid)) ||
    mentions.some((m) => m.includes(myNumber)) ||
    (myLidBase && mentions.some((m) => m.includes(myLidBase))) ||
    lowerText.includes(`@${myNumber}`) ||
    (myLidBase && lowerText.includes(`@${myLidBase}`)) ||
    (displayName && lowerText.includes(`@${displayName.toLowerCase()}`));

  const effectiveMention = allowMention && isMentioned;
  const effectiveReply = allowReply && isReplyToMe;
  const effectiveKeyword = allowKeyword && hasKeyword;

  if (!effectiveMention && !effectiveReply && !effectiveKeyword) {
    return {
      shouldProcess: false,
      triggerType: "UNKNOWN",
      quotedParticipant,
    };
  }

  let triggerType = "UNKNOWN";
  if (effectiveMention) triggerType = "MENTION";
  else if (effectiveReply) triggerType = "REPLY";
  else if (effectiveKeyword) triggerType = "KEYWORD";

  return {
    shouldProcess: true,
    triggerType,
    quotedParticipant,
  };
}

function getMediaHandlingState({
  messageType,
  lowerText,
  hasPending,
  saveKeywords,
  confirmKeywords,
  rejectKeywords,
}) {
  const isMedia = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
  ].includes(messageType);

  const hasSaveIntent =
    isMedia && saveKeywords.some((kw) => lowerText.includes(kw));
  const isConfirming =
    !isMedia &&
    hasPending &&
    confirmKeywords.some((kw) => lowerText.includes(kw));
  const isRejecting =
    !isMedia &&
    hasPending &&
    rejectKeywords.some((kw) => lowerText.includes(kw));

  return {
    isMedia,
    hasSaveIntent,
    isConfirming,
    isRejecting,
  };
}

function parseMediaTags(aiResponse) {
  const imageMatch = aiResponse.match(/\[SEND_IMAGE:\s*(https?:\/\/[^\]]+)\]/);
  const videoMatch = aiResponse.match(/\[SEND_VIDEO:\s*(https?:\/\/[^\]]+)\]/);
  const audioMatch = aiResponse.match(/\[SEND_AUDIO:\s*(https?:\/\/[^\]]+)\]/);

  const cleanResponse = aiResponse
    .replace(/\[SEND_IMAGE:[^\]]+\]/g, "")
    .replace(/\[SEND_VIDEO:[^\]]+\]/g, "")
    .replace(/\[SEND_AUDIO:[^\]]+\]/g, "")
    .trim();

  return {
    cleanResponse,
    imageUrl: imageMatch ? imageMatch[1] : null,
    videoUrl: videoMatch ? videoMatch[1] : null,
    audioUrl: audioMatch ? audioMatch[1] : null,
  };
}

module.exports = {
  getMessageText,
  getGroupTriggerInfo,
  getMediaHandlingState,
  parseMediaTags,
};
