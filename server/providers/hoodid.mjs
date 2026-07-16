export function createHoodIdProvider(config) {
  const registryAddress = config.hoodId.registryAddress;
  const profileBaseUrl = config.hoodId.profileBaseUrl;

  return {
    configured: Boolean(registryAddress),
    registryAddress,
    profileBaseUrl,
    async resolveName(name) {
      // Placeholder until registry ABI/address is provided.
      return { name, address: null, configured: Boolean(registryAddress), source: 'hoodid-placeholder' };
    },
    async reverseResolve(address) {
      // Placeholder until registry ABI/address is provided.
      return { address, name: null, configured: Boolean(registryAddress), source: 'hoodid-placeholder' };
    },
    profileUrl(name) {
      if (!name) return null;
      return new URL(String(name).replace(/^\//, ''), profileBaseUrl).toString();
    }
  };
}
