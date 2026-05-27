export const IDL = {
  address: 'BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1',
  metadata: { name: 'masterOfTheEpoch', version: '0.1.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'claimMaster',
      discriminator: [13, 126, 84, 49, 104, 197, 18, 165],
      accounts: [
        { name: 'epochState', writable: true, pda: { seeds: [{ kind: 'const', value: [101,112,111,99,104,95,115,116,97,116,101] }] } },
        { name: 'claimantRecord', writable: true, pda: { seeds: [{ kind: 'const', value: [109,97,115,116,101,114,95,114,101,99,111,114,100] }, { kind: 'account', path: 'claimant' }] } },
        { name: 'outgoingMasterRecord', writable: true },
        { name: 'claimant', writable: true, signer: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
    {
      name: 'closeEpoch',
      discriminator: [13, 87, 7, 133, 109, 14, 83, 25],
      accounts: [
        { name: 'epochState', writable: true, pda: { seeds: [{ kind: 'const', value: [101,112,111,99,104,95,115,116,97,116,101] }] } },
        { name: 'currentMasterRecord', pda: { seeds: [{ kind: 'const', value: [109,97,115,116,101,114,95,114,101,99,111,114,100] }, { kind: 'account', path: 'epoch_state.current_master', account: 'epochState' }] } },
        { name: 'caller', writable: true, signer: true },
        { name: 'winner', writable: true },
        { name: 'treasury', writable: true },
        { name: 'burnAddress', writable: true, address: '1nc1nerator11111111111111111111111111111111' },
      ],
      args: [],
    },
    {
      name: 'initializeEpoch',
      discriminator: [19, 114, 86, 107, 206, 21, 45, 39],
      accounts: [
        { name: 'epochState', writable: true, pda: { seeds: [{ kind: 'const', value: [101,112,111,99,104,95,115,116,97,116,101] }] } },
        { name: 'gameCounter', writable: true, pda: { seeds: [{ kind: 'const', value: [103,97,109,101,95,99,111,117,110,116,101,114] }] } },
        { name: 'payer', writable: true, signer: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: 'epochState', discriminator: [191, 63, 139, 237, 144, 12, 223, 210] },
    { name: 'gameCounter', discriminator: [117, 67, 148, 185, 138, 194, 249, 87] },
    { name: 'masterRecord', discriminator: [53, 20, 186, 51, 61, 19, 82, 140] },
  ],
  types: [
    {
      name: 'epochState',
      type: {
        kind: 'struct',
        fields: [
          { name: 'treasury', type: 'pubkey' },
          { name: 'currentMaster', type: 'pubkey' },
          { name: 'masterSince', type: 'i64' },
          { name: 'leadingMaster', type: 'pubkey' },
          { name: 'leadingMasterTime', type: 'u64' },
          { name: 'gameEpoch', type: 'u64' },
          { name: 'pot', type: 'u64' },
          { name: 'nextClaimCost', type: 'u64' },
          { name: 'closed', type: 'bool' },
          { name: 'bump', type: 'u8' },
          { name: 'gameId', type: 'u64' },
        ],
      },
    },
    {
      name: 'masterRecord',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'pubkey' },
          { name: 'lastClaim', type: 'i64' },
          { name: 'totalReignTime', type: 'u64' },
          { name: 'bump', type: 'u8' },
          { name: 'gameId', type: 'u64' },
        ],
      },
    },
  ],
} as const;
