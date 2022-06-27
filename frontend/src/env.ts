export const $env = {
  baseUrl: '',
  apiBaseUrl: 'http://localhost:3002/',
  credential: false,
  localProvider: {
    1: 'https://mainnet.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad',
    2: 'https://arb-mainnet.g.alchemy.com/v2/ILj6pmkFfRO3KflhcnPxVFtuqZvwgkgr',
    5: 'https://rinkeby.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad', // rinkeby
    22: 'https://arb-rinkeby.g.alchemy.com/v2/ILj6pmkFfRO3KflhcnPxVFtuqZvwgkgr',
  },
  localWSProvider: {
    1: 'wss://mainnet.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad',
    2: 'wss://arb-mainnet.g.alchemy.com/v2/ILj6pmkFfRO3KflhcnPxVFtuqZvwgkgr',
    5: 'wss://rinkeby.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad', // rinkeby
    22: 'wss://arb-rinkeby.g.alchemy.com/v2/ILj6pmkFfRO3KflhcnPxVFtuqZvwgkgr',
    6: 'https://polygon-mumbai.g.alchemy.com/v2/akjFuzojFyDyF67GAMXV1HGqlK6SPEGp',
    66: 'https://polygon-mumbai.g.alchemy.com/v2/akjFuzojFyDyF67GAMXV1HGqlK6SPEGp',
  },
  supportLocalNetWorksIDs: [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33, 44, 66, 77, 88, 99, 511,514
  ],
  localChainID_netChainID: {
    1: '1', // mainnet
    2: '42161', // Arbitrum
    3: '1', // zk
    4: '1', // starknet
    5: '4', // rinkeby
    6: '137', // polygon
    7: '10', // optimism
    8: '1', // mainnet
    9: '1', // loopring
    10: '1088',
    11: '1', // loopring
    22: '421611', // arbitrum test
    33: '4', // zktest
    44: '5', // starknet(R)
    66: '80001', // polygon(R)
    77: '69', // optimism(K)
    88: '3', // ropsten
    99: '5', // loopring(G)
    510: '588', // metis(G)
    511: '3', // dydx(R)
    13: '288',// boba
    513: '28',// boba(R) 
    514: '280',// boba(R) 
  },
  txExploreUrl: {
    1: 'https://etherscan.io/tx/', // /tx/  /address/
    5: 'https://rinkeby.etherscan.io/tx/', // /tx/  /address/
    2: 'https://arbiscan.io/tx/', // /tx/  /address/
    22: 'https://testnet.arbiscan.io/tx/',
    3: 'https://zkscan.io/explorer/transactions/',
    33: 'https://rinkeby.zkscan.io/explorer/transactions/', // /explorer/transactions/   /explorer/accounts/
    4: 'https://beta.voyager.online/tx/',
    44: 'https://beta-goerli.voyager.online/tx/',
    6: 'https://polygonscan.com/tx/',
    66: 'https://mumbai.polygonscan.com/tx/',
    7: 'https://optimistic.etherscan.io/tx/',
    77: 'https://kovan-optimistic.etherscan.io/tx/',
    8: 'https://immutascan.io/tx/',
    88: '',
    9: 'https://explorer.loopring.io/tx/',
    99: 'https://explorer.loopring.io/tx/',
    10: 'https://andromeda-explorer.metis.io/tx/',
    510: 'https://stardust-explorer.metis.io/tx/',
    11: 'https://trade.dydx.exchange/',
    511: 'https://trade.stage.dydx.exchange/',
    12: 'https://zkspace.info/transaction/',
    512: 'https://v3-rinkeby.zkswap.info/transaction/',
    13: "https://blockexplorer.boba.network/tx/",
    513: "https://blockexplorer.rinkeby.boba.network/tx/",
    514: "https://zksync2-testnet.zkscan.io/tx/",
  },
  accountExploreUrl: {
    1: 'https://etherscan.io/address/', // /tx/  /address/
    5: 'https://rinkeby.etherscan.io/address/', // /tx/  /address/
    2: 'https://arbiscan.io/address/', // /tx/  /address/
    22: 'https://testnet.arbiscan.io/address/',
    3: 'https://zkscan.io/explorer/accounts/',
    33: 'https://rinkeby.zkscan.io/explorer/accounts/', // /explorer/transactions/   /explorer/accounts/
    4: 'https://beta.voyager.online/contract/',
    44: 'https://beta-goerli.voyager.online/contract/',
    6: 'https://polygonscan.com/address/',
    66: 'https://mumbai.polygonscan.com/address/',
    7: 'https://optimistic.etherscan.io/address/',
    77: 'https://kovan-optimistic.etherscan.io/address/',
    8: 'https://immutascan.io/address/',
    88: '',
    9: 'https://explorer.loopring.io/account/',
    99: 'https://explorer.loopring.io/account/',
    10: 'https://andromeda-explorer.metis.io/address/',
    510: 'https://stardust-explorer.metis.io/address/',
    11: 'https://trade.dydx.exchange/',
    511: 'https://trade.stage.dydx.exchange/',
    12: 'https://zkspace.info/account/',
    512: 'https://v3-rinkeby.zkswap.info/account/',
    13: "https://blockexplorer.boba.network/address/",
    513: "https://blockexplorer.rinkeby.boba.network/address/",
    514: "https://zksync2-testnet.zkscan.io/address/"
  },
  tokenExploreUrl: {
    1: 'https://etherscan.io/token/', // /token/
    5: 'https://rinkeby.etherscan.io/token/', // /token/
    2: 'https://arbiscan.io/address/', // /address/
    22: 'https://testnet.arbitrum.io/address/',
    3: 'https://etherscan.io/token/', // same as etherscan
    33: 'https://rinkeby.etherscan.io/token/',
    4: 'https://beta.voyager.online/token/',
    44: 'https://beta-goerli.voyager.online/token/',
    6: 'https://polygonscan.com/token/',
    66: 'https://mumbai.polygonscan.com/token/',
    7: 'https://optimistic.etherscan.io/token/',
    77: 'https://kovan-optimistic.etherscan.io/token/',
    10: 'https://andromeda-explorer.metis.io/token/',
    510: 'https://stardust-explorer.metis.io/token/',
    11: 'https://trade.dydx.exchange/',
    511: 'https://trade.stage.dydx.exchange/',
    12: 'https://zkspace.info/token/',
    512: 'https://v3-rinkeby.zkswap.info/token/',
    13: "https://blockexplorer.boba.network/",
    513: "https://blockexplorer.rinkeby.boba.network/",
    514: "https://zksync2-testnet.zkscan.io/token/"
  },
}
