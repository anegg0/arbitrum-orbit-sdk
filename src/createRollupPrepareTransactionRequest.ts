import { Address, PublicClient, encodeFunctionData, zeroAddress } from 'viem';

import { defaults } from './createRollupDefaults';
import { createRollupGetCallValue } from './createRollupGetCallValue';
import { createRollupGetMaxDataSize } from './createRollupGetMaxDataSize';
import { rollupCreator } from './contracts';
import { validateParentChain } from './types/ParentChain';
import { isCustomFeeTokenAddress } from './utils/isCustomFeeTokenAddress';
import { ChainConfig } from './types/ChainConfig';
import { isAnyTrustChainConfig } from './utils/isAnyTrustChainConfig';
import { getRollupCreatorAddress } from './utils/getters';
import { fetchDecimals } from './utils/erc20';
import { TransactionRequestGasOverrides, applyPercentIncrease } from './utils/gasOverrides';

import { Prettify } from './types/utils';
import {
  CreateRollupFunctionInputs,
  CreateRollupParams,
  WithRollupCreatorAddressOverride,
} from './types/createRollupTypes';

/**
 * Encodes the function data for creating a rollup.
 *
 * @param {CreateRollupFunctionInputs} args - The inputs for creating the rollup.
 * @returns {string} The encoded function data.
 */
function createRollupEncodeFunctionData(args: CreateRollupFunctionInputs) {
  return encodeFunctionData({
    abi: rollupCreator.abi,
    functionName: 'createRollup',
    args,
  });
}

export type CreateRollupPrepareTransactionRequestParams = Prettify<
  WithRollupCreatorAddressOverride<{
    params: CreateRollupParams;
    account: Address;
    publicClient: PublicClient;
    gasOverrides?: TransactionRequestGasOverrides;
  }>
>;

/**
 * Prepares a transaction request for creating a rollup.
 *
 * @param {CreateRollupPrepareTransactionRequestParams} createRollupPrepareTransactionRequestParams - The parameters for preparing the transaction request.
 * @param {CreateRollupParams} createRollupPrepareTransactionRequestParams.params - The parameters for creating the rollup.
 * @param {Address} createRollupPrepareTransactionRequestParams.account - The address of the account creating the rollup.
 * @param {PublicClient} createRollupPrepareTransactionRequestParams.publicClient - The public client for interacting with the blockchain.
 * @param {TransactionRequestGasOverrides} [createRollupPrepareTransactionRequestParams.gasOverrides] - Optional gas overrides for the transaction.
 * @param {string} [createRollupPrepareTransactionRequestParams.rollupCreatorAddressOverride] - Optional override for the rollup creator address.
 * @returns {Promise<Object>} The prepared transaction request.
 *
 * @throws Will throw an error if the batchPoster address is the zero address.
 * @throws Will throw an error if the validators array is empty or contains the zero address.
 * @throws Will throw an error if a custom fee token is used on non-AnyTrust chains.
 * @throws Will throw an error if a custom fee token with non-18 decimals is used.
 *
 * @example
 * const txRequest = await createRollupPrepareTransactionRequest({
 *   params: createRollupParams,
 *   account: '0xYourAccountAddress',
 *   publicClient: yourPublicClientInstance,
 *   gasOverrides: { gasLimit: { base: 1000000n, percentIncrease: 20 } },
 *   rollupCreatorAddressOverride: '0xRollupCreatorAddressOverride',
 * });
 *
 * // Now you can use txRequest to send the transaction
 */
export async function createRollupPrepareTransactionRequest({
  params,
  account,
  publicClient,
  gasOverrides,
  rollupCreatorAddressOverride,
}: CreateRollupPrepareTransactionRequestParams) {
  const chainId = validateParentChain(publicClient);

  if (params.batchPoster === zeroAddress) {
    throw new Error(`"params.batchPoster" can't be set to the zero address.`);
  }

  if (params.validators.length === 0 || params.validators.includes(zeroAddress)) {
    throw new Error(`"params.validators" can't be empty or contain the zero address.`);
  }

  const chainConfig: ChainConfig = JSON.parse(params.config.chainConfig);

  if (isCustomFeeTokenAddress(params.nativeToken)) {
    // custom fee token is only allowed for anytrust chains
    if (!isAnyTrustChainConfig(chainConfig)) {
      throw new Error(
        `"params.nativeToken" can only be used on AnyTrust chains. Set "arbitrum.DataAvailabilityCommittee" to "true" in the chain config.`,
      );
    }

    // custom fee token is only allowed to have 18 decimals
    if ((await fetchDecimals({ address: params.nativeToken, publicClient })) !== 18) {
      throw new Error(
        `"params.nativeToken" can only be configured with a token that uses 18 decimals.`,
      );
    }
  }

  const maxDataSize = createRollupGetMaxDataSize(chainId);
  const paramsWithDefaults = { ...defaults, ...params, maxDataSize };

  const request = await publicClient.prepareTransactionRequest({
    chain: publicClient.chain,
    to: rollupCreatorAddressOverride ?? getRollupCreatorAddress(publicClient),
    data: createRollupEncodeFunctionData([paramsWithDefaults]),
    value: createRollupGetCallValue(paramsWithDefaults),
    account,
    // if the base gas limit override was provided, hardcode gas to 0 to skip estimation
    // we'll set the actual value in the code below
    gas: typeof gasOverrides?.gasLimit?.base !== 'undefined' ? 0n : undefined,
  });

  // potential gas overrides (gas limit)
  if (gasOverrides && gasOverrides.gasLimit) {
    request.gas = applyPercentIncrease({
      // the ! is here because we should let it error in case we don't have the estimated gas
      base: gasOverrides.gasLimit.base ?? request.gas!,
      percentIncrease: gasOverrides.gasLimit.percentIncrease,
    });
  }

  return { ...request, chainId };
}
