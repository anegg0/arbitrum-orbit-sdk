import { Address, PublicClient } from 'viem';
import { AbiEvent } from 'abitype';

import { validateParentChain } from './types/ParentChain';
import {
  mainnet,
  arbitrumOne,
  arbitrumNova,
  sepolia,
  holesky,
  arbitrumSepolia,
  nitroTestnodeL1,
  nitroTestnodeL2,
} from './chains';

export type CreateRollupFetchTransactionHashParams = {
  rollup: Address;
  publicClient: PublicClient;
};

const RollupInitializedEventAbi: AbiEvent = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: 'bytes32',
      name: 'machineHash',
      type: 'bytes32',
    },
    {
      indexed: false,
      internalType: 'uint256',
      name: 'chainId',
      type: 'uint256',
    },
  ],
  name: 'RollupInitialized',
  type: 'event',
};

const earliestRollupCreatorDeploymentBlockNumber = {
  // mainnet
  [mainnet.id]: 18736164n,
  [arbitrumOne.id]: 150599584n,
  [arbitrumNova.id]: 47798739n,
  // testnet
  [sepolia.id]: 4741823n,
  [holesky.id]: 1083992n,
  [arbitrumSepolia.id]: 654628n,
  // local nitro-testnode
  [nitroTestnodeL1.id]: 0n,
  [nitroTestnodeL2.id]: 0n,
};

/**
 * Fetches the transaction hash for the RollupInitialized event of a given rollup.
 *
 * @param {CreateRollupFetchTransactionHashParams} params - The parameters for fetching the transaction hash
 * @param {Address} params.rollup - The rollup contract address
 * @param {PublicClient} params.publicClient - The public client to interact with the blockchain
 *
 * @returns {Promise<string>} The transaction hash that emitted the RollupInitialized event
 *
 * @throws Will throw an error if no transaction hash is found or if multiple RollupInitialized events are found
 *
 * @example
 * const transactionHash = await createRollupFetchTransactionHash({
 *   rollup: '0xYourRollupAddress',
 *   publicClient: yourPublicClientInstance,
 * });
 * console.log(transactionHash);
 */
export async function createRollupFetchTransactionHash({
  rollup,
  publicClient,
}: CreateRollupFetchTransactionHashParams): Promise<string> {
  const chainId = validateParentChain(publicClient);

  const fromBlock =
    chainId in earliestRollupCreatorDeploymentBlockNumber
      ? earliestRollupCreatorDeploymentBlockNumber[chainId]
      : 'earliest';

  // Find the RollupInitialized event from that Rollup contract
  const rollupInitializedEvents = await publicClient.getLogs({
    address: rollup,
    event: RollupInitializedEventAbi,
    fromBlock,
    toBlock: 'latest',
  });

  if (rollupInitializedEvents.length !== 1) {
    throw new Error(
      `Expected to find 1 RollupInitialized event for rollup address ${rollup} but found ${rollupInitializedEvents.length}`,
    );
  }

  // Get the transaction hash that emitted that event
  const transactionHash = rollupInitializedEvents[0].transactionHash;

  if (!transactionHash) {
    throw new Error(
      `No transactionHash found in RollupInitialized event for rollup address ${rollup}`,
    );
  }

  return transactionHash;
}

