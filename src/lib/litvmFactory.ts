import { parseAbi } from "viem";
import { EXPLORER_URL, LITVM_CHAIN_ID, RPC_URL } from "./litvm";

// Deployed master factory on LitVM (Chain 4441)
export const LITVM_FACTORY_ADDRESS = "0xdd56517bFfDf6915918DbEDf1124b5F21D26f684" as const;
export const LITVM_FACTORY_CHAIN_ID = LITVM_CHAIN_ID;
export const LITVM_FACTORY_EXPLORER = EXPLORER_URL;
export const LITVM_FACTORY_RPC = RPC_URL;
export const LITVM_FACTORY_NATIVE_SYMBOL = "zkLTC";
export const LITVM_FACTORY_DEFAULT_FEE_ETHER = "0.05";

export enum FactoryContractType {
  ERC20 = 0,
  NFT = 1,
  STAKING = 2,
  VESTING = 3,
}

export const FACTORY_TYPE_LABEL: Record<number, string> = {
  0: "ERC20",
  1: "NFT",
  2: "Staking",
  3: "Vesting",
};

export const LITVM_FACTORY_ABI = parseAbi([
  "function deployFee() view returns (uint256)",
  "function deployERC20(string name_, string symbol_, uint8 decimals_, uint256 totalSupply_, bool mintable_, bool burnable_, bool pausable_) payable returns (address)",
  "function deployNFT(string name_, string symbol_, string baseURI_, uint256 maxSupply_, uint256 mintPrice_, bool publicMint_) payable returns (address)",
  "function deployStaking(address stakingToken_, address rewardToken_, uint256 rewardRatePerDay_, uint256 lockPeriodDays_, string label_) payable returns (address)",
  "function deployVesting(address token_, address beneficiary_, uint256 totalAmount_, uint256 cliffDays_, uint256 durationDays_, bool revocable_, string label_) payable returns (address)",
  "function getAllContracts() view returns (address[])",
  "function getContractsByCreator(address creator_) view returns (address[])",
  "function getContractInfo(address addr_) view returns ((address contractAddress, address creator, uint8 contractType, string label, uint256 deployedAt))",
  "function getTotalDeployed() view returns (uint256)",
  "event ContractDeployed(address indexed contractAddress, address indexed creator, uint8 contractType, string label, uint256 deployedAt)",
]);

export type FactoryDeployedInfo = {
  contractAddress: `0x${string}`;
  creator: `0x${string}`;
  contractType: number;
  label: string;
  deployedAt: bigint;
};
