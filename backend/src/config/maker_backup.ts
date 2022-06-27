export default {
  starknetL1MapL2: {
    'mainnet-alpha': {
      'xxxxx': 'xxxx',
    },
    'georli-alpha': {
      '0x8a3214f28946a797088944396c476f014f88dd37':
        '0x033b88fc03a2ccb1433d6c70b73250d0513c6ee17a7ab61c5af0fbe16bd17a6e',
    },
  },
  mainnet: {
    wsEndPoint: 'wss://eth-mainnet.alchemyapi.io/v2/Your Key',
    httpEndPoint: 'https://eth-mainnet.alchemyapi.io/v2/Your Key',
    api: {
      endPoint: 'https://api.etherscan.io/api',
      key: 'Your Key', // limit
    },
    gasKey: 'Your Key',
    gasPrice: 0,
  },
  rinkeby: {
    wsEndPoint: 'wss://eth-rinkeby.alchemyapi.io/v2/Your Key',
    httpEndPoint: 'https://eth-rinkeby.alchemyapi.io/v2/Your Key',
    api: {
      endPoint: 'https://api-rinkeby.etherscan.io/api',
      key: 'Your Key',
    },
    gasPrice: 2,
  },
  arbitrum: {
    wsEndPoint: 'wss://arb-mainnet.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://arb-mainnet.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://api.arbiscan.io/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 42161,
  },
  arbitrum_test: {
    wsEndPoint: 'wss://arb-rinkeby.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://arb-rinkeby.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://testnet.arbiscan.io/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 421611,
  },
  zksync: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.zksync.io/api/v0.2',
    api: {
      endPoint: 'https://api.zksync.io/api/v0.2',
      key: '',
    },
    gasPrice: 2,
  },
  zksync_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://rinkeby-api.zksync.io/api/v0.2',
    api: {
      endPoint: 'https://rinkeby-api.zksync.io/api/v0.2',
      key: '',
    },
    gasPrice: 2,
  },
  starknet: {
    wsEndPoint: null,
    httpEndPoint: 'https://voyager.online/api',
    api: {
      endPoint: 'https://voyager.online/api',
      key: '',
    },
    gasPrice: 2,
  },
  starknet_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://goerli.voyager.online/api',
    api: {
      endPoint: 'https://goerli.voyager.online/api',
      key: '',
    },
    gasPrice: 2,
  },
  polygon: {
    wsEndPoint: 'wss://polygon-mainnet.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://polygon-mainnet.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://api.polygonscan.com/api',
      key: 'Your Key',
    },
    gasPrice: 2,
    customChainId: 137,
  },
  polygon_test: {
    wsEndPoint: 'wss://polygon-mumbai.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://polygon-mumbai.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://api-testnet.polygonscan.com/api',
      key: 'Your Key',
    },
    gasPrice: 2,
    customChainId: 80001,
  },
  metis: {
    wsEndPoint: 'wss://andromeda-ws.metis.io',
    httpEndPoint: 'https://andromeda.metis.io/?owner=1088',
    api: {
      endPoint: 'https://andromeda-explorer.metis.io/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 1088,
  },
  metis_test: {
    wsEndPoint: 'wss://stardust-ws.metis.io',
    httpEndPoint: 'https://stardust.metis.io/?owner=588',
    api: {
      endPoint: 'https://stardust-explorer.metis.io/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 588,
  },
  optimism: {
    wsEndPoint: 'wss://opt.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://opt.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://api-optimistic.etherscan.io/api',
      key: 'Your Key',
    },
    gasPrice: 2,
    customChainId: 10,
  },
  optimism_test: {
    wsEndPoint: 'wss://opt-kovan.g.alchemy.com/v2/Your Key',
    httpEndPoint: 'https://opt-kovan.g.alchemy.com/v2/Your Key',
    api: {
      endPoint: 'https://api-kovan-optimistic.etherscan.io/api',
      key: 'Your Key',
    },
    gasPrice: 2,
    customChainId: 69,
  },
  immutableX: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.x.immutable.com/v1',
    api: {
      endPoint: 'https://api.x.immutable.com/v1',
      key: '',
    },
    gasPrice: 2,
  },
  immutableX_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.ropsten.x.immutable.com/v1',
    api: {
      endPoint: 'https://api.ropsten.x.immutable.com/v1',
      key: '',
    },
    gasPrice: 2,
  },
  loopring: {
    wsEndPoint: null,
    httpEndPoint: 'https://api3.loopring.io/api/v3',
    api: {
      endPoint: 'https://api3.loopring.io/api/v3',
      key: '',
    },
    gasPrice: 2,
  },
  loopring_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://uat2.loopring.io',
    api: {
      endPoint: 'https://uat2.loopring.io',
      key: '',
    },
    gasPrice: 2,
  },
  dydx: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.dydx.exchange',
    api: {
      endPoint: 'https://api.dydx.exchange',
      key: '',
    },
    gasPrice: 2,
  },
  dydx_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.stage.dydx.exchange',
    api: {
      endPoint: 'https://api.stage.dydx.exchange',
      key: '',
    },
    gasPrice: 2,
  },
  zkspace: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.zks.app/v3/1',
    api: {
      endPoint: 'https://api.zks.app/v3/1',
      key: '',
      chainID: 13,
    },
    gasPrice: 2,
  },
  zkspace_test: {
    wsEndPoint: null,
    httpEndPoint: 'https://api.zks.app/v3/4',
    api: {
      endPoint: 'https://api.zks.app/v3/4',
      key: '',
      chainID: 133,
    },
    gasPrice: 2,
  },
  boba: {
    wsEndPoint: 'wss://ws.mainnet.boba.network',
    httpEndPoint: 'https://mainnet.boba.network',
    api: {
      endPoint: 'https://blockexplorer.boba.network/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 288,
  },
  boba_test: {
    wsEndPoint: 'wss://wss.rinkeby.boba.network',
    httpEndPoint: 'https://rinkeby.boba.network',
    api: {
      endPoint: 'https://blockexplorer.rinkeby.boba.network/graphiql',
      key: '',
    },
    gasPrice: 2,
    customChainId: 28,
  },
  zksync2_test: {
    wsEndPoint: 'wss://zksync2-testnet.zksync.dev/ws',
    httpEndPoint: 'https://zksync2-testnet.zksync.dev',
    api: {
      endPoint: 'https://zksync2-testnet.zkscan.io/api',
      key: '',
    },
    gasPrice: 2,
    customChainId: 280,
  },
  privateKeys: {}, // ex: {'0x0043d60e87c5dd08C86C3123340705a1556C4719': 'This address's private key'}
  crossAddressContracts: {},
  ABI: [
    {
      inputs: [
        { internalType: 'uint256', name: '_initialSupply', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'owner',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'spender',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'value',
          type: 'uint256',
        },
      ],
      name: 'Approval',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
      ],
      name: 'MinterAdded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
      ],
      name: 'MinterRemoved',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'from',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
      ],
      name: 'NewOwnership',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'from',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
      ],
      name: 'NewPendingOwnership',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'from',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'value',
          type: 'uint256',
        },
      ],
      name: 'Transfer',
      type: 'event',
    },
    {
      inputs: [],
      name: 'acceptOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
      name: 'addMinter',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'owner', type: 'address' },
        { internalType: 'address', name: 'spender', type: 'address' },
      ],
      name: 'allowance',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'spender', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
      name: 'approve',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
      name: 'burn',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'account', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
      name: 'burnFrom',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'decimals',
      outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'spender', type: 'address' },
        { internalType: 'uint256', name: 'subtractedValue', type: 'uint256' },
      ],
      name: 'decreaseAllowance',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'governor',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'spender', type: 'address' },
        { internalType: 'uint256', name: 'addedValue', type: 'uint256' },
      ],
      name: 'increaseAllowance',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
      name: 'isMinter',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: '_to', type: 'address' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'mint',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'name',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '', type: 'address' }],
      name: 'nonces',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'pendingGovernor',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: '_owner', type: 'address' },
        { internalType: 'address', name: '_spender', type: 'address' },
        { internalType: 'uint256', name: '_value', type: 'uint256' },
        { internalType: 'uint256', name: '_deadline', type: 'uint256' },
        { internalType: 'uint8', name: '_v', type: 'uint8' },
        { internalType: 'bytes32', name: '_r', type: 'bytes32' },
        { internalType: 'bytes32', name: '_s', type: 'bytes32' },
      ],
      name: 'permit',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
      name: 'removeMinter',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'renounceMinter',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'symbol',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'recipient', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
      name: 'transfer',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'sender', type: 'address' },
        { internalType: 'address', name: 'recipient', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
      name: 'transferFrom',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: '_newGovernor', type: 'address' },
      ],
      name: 'transferOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
}
