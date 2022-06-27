import { Token } from "./../types/chain";
import { IChainConfig } from "../types/chain";
import { equals } from "./core";
export class Chain {
  static configs: Array<IChainConfig> = [];
  static fill(configList: Array<IChainConfig>) {
    const chains = configList.map((chain: IChainConfig) => {
      chain.tokens =
        chain.tokens?.map((row: Token) => {
          row.mainCoin = equals(row.address, chain.nativeCurrency.address);
          return row;
        }) || [];
      if (
        chain.tokens.findIndex((token) =>
          equals(token.address, chain.nativeCurrency.address)
        ) == -1
      ) {
        chain.tokens.unshift({
          id: chain.nativeCurrency.id,
          name: chain.nativeCurrency.name,
          symbol: chain.nativeCurrency.symbol,
          decimals: chain.nativeCurrency.decimals,
          address: chain.nativeCurrency.address,
          mainCoin: true,
        });
      }
      return chain;
    });
    Chain.configs = chains;
    return chains;
  }
}
export function getAllChains(): IChainConfig[] {
  return Chain.configs || [];
}
export function getTokenByAddress(chainId: string, tokenAddress: string) {
  const chain: IChainConfig = getChain(chainId);
  return chain.tokens.find((row) => equals(row.address, tokenAddress));
}
export function getChain(chainId: string): IChainConfig {
  const chain: IChainConfig | undefined = Chain.configs.find(
    (x) => x.chainId === chainId
  );
  if (!chain || typeof chain === "undefined") {
    throw new Error(`No chain found matching chainId: ${chainId}`);
  }
  chain.tokens = chain.tokens.map((row) => {
    row.mainCoin = equals(row.address, chain.nativeCurrency.address);
    return row;
  });
  if (
    chain.tokens.findIndex((token) =>
      equals(token.address, chain.nativeCurrency.address)
    ) == -1
  ) {
    chain.tokens.unshift({
      id: chain.nativeCurrency.id,
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
      address: chain.nativeCurrency.address,
      mainCoin: true,
    });
  }

  return chain as IChainConfig;
}
export function getChainByInternalId(
  internalId: IChainConfig["internalId"]
): IChainConfig {
  const chain = getChainByKeyValue("internalId", internalId);
  return chain;
}

export function getChainByChainId(
  chainId: IChainConfig["chainId"]
): IChainConfig {
  const chain = getChain(chainId);
  return chain;
}

export function getChainByKeyValue(
  key: keyof IChainConfig,
  value: any
): IChainConfig {
  const allChains = getAllChains();

  const chain: IChainConfig | undefined = allChains.find(
    (chain) => chain[key] === value
  );
  if (typeof chain === "undefined") {
    throw new Error(`No chain found matching ${key}: ${value}`);
  }

  return getChain(chain.chainId);
}

export function getChainByNetworkId(
  networkId: IChainConfig["networkId"]
): IChainConfig {
  const chain = getChainByKeyValue("networkId", networkId);
  return chain;
}

export function convertNetworkIdToChainId(
  networkId: IChainConfig["networkId"]
): string {
  const chain = getChainByNetworkId(networkId);
  return chain.chainId;
}

export function convertChainIdToNetworkId(
  chainId: IChainConfig["chainId"]
): string {
  const chain = getChain(chainId);
  return chain.networkId;
}
