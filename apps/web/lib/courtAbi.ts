// Generated from contracts/artifacts (MiterCourt). Do not edit by hand.
export const courtAbi = [
  {
    "inputs": [
      {
        "internalType": "contract ITapeOutFactory",
        "name": "_factory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_feeRecipient",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "_feeBps",
        "type": "uint16"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyCommitted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadExpiry",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadInputLength",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadStake",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CommitTooFresh",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotFunder",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOpen",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "cpu",
        "type": "address"
      }
    ],
    "name": "NotProcessor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotWithdrawable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OutputsAgree",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PinMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SameCircuit",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Stateful",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownCommitment",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "funder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "targetId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "spec",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "specId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint40",
        "name": "expiry",
        "type": "uint40"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "targetHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "specHash",
        "type": "bytes32"
      }
    ],
    "name": "BountyOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint64",
        "name": "targetId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "spec",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "specId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "bountyId",
        "type": "uint256"
      }
    ],
    "name": "CircuitBroken",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "hunter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "input",
        "type": "bytes"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "targetOut",
        "type": "bytes"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "specOut",
        "type": "bytes"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "paid",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fee",
        "type": "uint256"
      }
    ],
    "name": "Claimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "hunter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      }
    ],
    "name": "Committed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "targetHashNow",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "specHashNow",
        "type": "bytes32"
      }
    ],
    "name": "Voided",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "funder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Withdrawn",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MIN_COMMIT_AGE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MIN_DURATION",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "bondedOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bountyCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "brokenAgainst",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "cpu",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "id",
        "type": "uint64"
      }
    ],
    "name": "circuitKey",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "commit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "commitBlock",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "input",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "hunter",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      }
    ],
    "name": "commitmentOf",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "counterexampleOf",
    "outputs": [
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "factory",
    "outputs": [
      {
        "internalType": "contract ITapeOutFactory",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeRecipient",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feesAccrued",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getBounty",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "funder",
            "type": "address"
          },
          {
            "internalType": "uint96",
            "name": "amount",
            "type": "uint96"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "targetId",
            "type": "uint64"
          },
          {
            "internalType": "address",
            "name": "spec",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "specId",
            "type": "uint64"
          },
          {
            "internalType": "bytes32",
            "name": "targetHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "specHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "nIn",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "nOut",
            "type": "uint32"
          },
          {
            "internalType": "uint40",
            "name": "expiry",
            "type": "uint40"
          },
          {
            "internalType": "enum MiterCourt.State",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "hunter",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "openedBlock",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "settledBlock",
            "type": "uint64"
          }
        ],
        "internalType": "struct MiterCourt.Bounty",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "cpu",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "id",
        "type": "uint64"
      }
    ],
    "name": "netlistHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "targetId",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "spec",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "specId",
        "type": "uint64"
      },
      {
        "internalType": "uint40",
        "name": "expiry",
        "type": "uint40"
      }
    ],
    "name": "open",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "targetId",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "spec",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "specId",
        "type": "uint64"
      }
    ],
    "name": "pairKey",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "input",
        "type": "bytes"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      }
    ],
    "name": "reveal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "targetId",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "spec",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "specId",
        "type": "uint64"
      }
    ],
    "name": "statusOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "bonded",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "brokenByBounty",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sweepFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
