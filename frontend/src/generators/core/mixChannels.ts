/**
 * One channel of several, in order (`a.concat(b)`); a single name stays as it
 * is. A channel named twice (two arms of a branch set the same one) is read once.
 */
export function buildMixedChannelExpression(names: string[]): string {
  const channelNames = [...new Set(names)];
  if (channelNames.length === 1) {
    return channelNames[0];
  }

  return channelNames
    .slice(1)
    .reduce((expression, channelName) => `${expression}.concat(${channelName})`, channelNames[0]);
}
