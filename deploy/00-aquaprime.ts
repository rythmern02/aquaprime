// SPDX-License-Identifier: MIT
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "hardhat-deploy";
import { writeDeployment } from "../scripts/lib/deployment-file";

/**
 * Deploys the full AquaPrime stack.
 *
 * Local (hardhat / localhost): official Aqua.sol bytecode, WETHMock, 6-dec test USDC and an
 *   OperatorPriceFeed (so the market crash can be demonstrated).
 * Live (sepolia, mainnet, …): canonical WETH, Circle USDC and Chainlink ETH/USD. Set AQUA_ADDRESS to
 *   reuse an already deployed official Aqua.
 */
const LIVE: Record<string, { weth: string; usdc: string; feed: string }> = {
  sepolia: {
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    feed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  },
  mainnet: {
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const live = LIVE[network.name];
  const opts = { from: deployer, log: true, waitConfirmations: isLocal ? 1 : 2 };

  const aqua = process.env.AQUA_ADDRESS || (await deploy("Aqua", { ...opts, args: [] })).address;

  let weth: string, usdc: string, feed: string;
  if (isLocal) {
    weth = (await deploy("WETHMock", { ...opts, args: [] })).address;
    usdc = (await deploy("TokenMockDecimals", { ...opts, args: ["USD Coin (test)", "USDC", 6] })).address;
  } else {
    if (!live && !(process.env.WETH_ADDRESS && process.env.USDC_ADDRESS && process.env.PRICE_FEED))
      throw new Error(`Set WETH_ADDRESS, USDC_ADDRESS, PRICE_FEED for network ${network.name}`);
    weth = process.env.WETH_ADDRESS || live.weth;
    usdc = process.env.USDC_ADDRESS || live.usdc;
  }

  if (isLocal || process.env.ORACLE_MODE === "operator") {
    const initial = BigInt(process.env.INITIAL_ETH_PRICE_E8 || "250000000000");
    feed = (await deploy("OperatorPriceFeed", { ...opts, args: [8, "ETH / USD (operator)", initial, deployer] })).address;
  } else {
    feed = process.env.PRICE_FEED || live.feed;
  }

  const treasury = process.env.TREASURY_ADDRESS || deployer;
  const attester = process.env.ATTESTER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.ATTESTER_PRIVATE_KEY).address
    : deployer;
  const keeper = process.env.KEEPER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY).address
    : deployer;

  const router = (await deploy("AquaPrimeRouter", { ...opts, args: [aqua, weth, deployer] })).address;
  const builder = (await deploy("StrategyBuilder", { ...opts, args: [] })).address;
  const registry = (await deploy("CreditPositionRegistry", {
    ...opts, args: [aqua, router, builder, weth, usdc, feed, treasury, attester, deployer],
  })).address;
  const executor = (await deploy("LiquidationExecutor", { ...opts, args: [aqua, router, registry, deployer] })).address;
  const aquaAMM = (await deploy("AquaAMM", { ...opts, args: [aqua] })).address;

  if (keeper.toLowerCase() !== deployer.toLowerCase()) {
    const ex = await ethers.getContractAt("LiquidationExecutor", executor);
    if (!(await ex.operators(keeper))) await (await ex.setOperator(keeper, true)).wait();
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  writeDeployment(chainId, {
    chainId,
    network: network.name,
    contracts: { aqua, weth, usdc, priceFeed: feed, router, builder, registry, executor, aquaAMM },
    roles: { deployer, treasury, attester, keeper },
    oracleMode: isLocal || process.env.ORACLE_MODE === "operator" ? "operator" : "chainlink",
  });

  console.log("\n=== AquaPrime deployment ===");
  console.table({ aqua, weth, usdc, feed, router, builder, registry, executor, aquaAMM, treasury, attester, keeper });
};

export default func;
func.tags = ["AquaPrime"];
