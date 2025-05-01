/**
 * Gets a Solana Explorer URL for the given signature
 */
export function getExplorerUrl(signature: string, cluster: 'mainnet-beta' | 'testnet' | 'devnet' | 'custom' = 'devnet'): string {
  let baseUrl: string;

  switch (cluster) {
    case 'mainnet-beta':
      baseUrl = 'https://explorer.solana.com';
      break;
    case 'testnet':
      baseUrl = 'https://explorer.solana.com/?cluster=testnet';
      break;
    case 'devnet':
      baseUrl = 'https://explorer.solana.com/?cluster=devnet';
      break;
    case 'custom':
      // For local development 
      return `http://localhost:8899/tx/${signature}?cluster=custom`;
    default:
      baseUrl = 'https://explorer.solana.com';
  }

  return `${baseUrl}/tx/${signature}`;
}

/**
 * Gets a Solana Explorer URL for the given address
 */
export function getAddressExplorerUrl(address: string, cluster: 'mainnet-beta' | 'testnet' | 'devnet' | 'custom' = 'devnet'): string {
  let baseUrl: string;

  switch (cluster) {
    case 'mainnet-beta':
      baseUrl = 'https://explorer.solana.com';
      break;
    case 'testnet':
      baseUrl = 'https://explorer.solana.com/?cluster=testnet';
      break;
    case 'devnet':
      baseUrl = 'https://explorer.solana.com/?cluster=devnet';
      break;
    case 'custom':
      // For local development
      return `http://localhost:8899/address/${address}?cluster=custom`;
    default:
      baseUrl = 'https://explorer.solana.com';
  }

  return `${baseUrl}/address/${address}`;
} 