/** One channel of several, in order (`a.concat(b)`); a single name stays as it is. */
export function buildMixedChannelExpression(channelNames: string[]): string {
  if (channelNames.length === 1) {
    return channelNames[0];
  }

  return channelNames
    .slice(1)
    .reduce((expression, channelName) => `${expression}.concat(${channelName})`, channelNames[0]);
}
