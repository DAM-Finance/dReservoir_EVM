# $1 param is hardhat network name.
# This also deploys a test collateral contract as opposed to reusing an existing one.
# You must run "start-network.sh PORT" before running this script.

export MAILBOX_DOMAIN_ID="13371"
export TOKEN_SYMBOL="USDC"
export TOKEN_NAME="Test USDC"

npx hardhat deploy --network testOne --tags d2o,lmcv,hyperlane-lib,hyperlane-pipe,collateral,psm