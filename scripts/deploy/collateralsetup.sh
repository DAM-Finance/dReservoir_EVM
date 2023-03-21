# $1 param is hardhat network name.
# This also deploys a test collateral contract as opposed to reusing an existing one.

export TOKEN_SYMBOL="USDC"
export TOKEN_NAME="Test USDC"

npx hardhat deploy --network sepolia --tags lmcv
npx hardhat deploy --network sepolia --tags collateral,psm
npx hardhat deploy --network sepolia --tags psm