# $1 param is hardhat network name.
# This also deploys a test collateral contract as opposed to reusing an existing one.
# You must run "start-network.sh PORT" before running this script.

./scripts/test/deploy-d2o.sh $1
./scripts/test/deploy-hyperlane-lib.sh $1
./scripts/test/deploy-hyperlane-pipe.sh $1
./scripts/test/deploy-lmcv.sh $1
./scripts/test/deploy-collateral.sh $1
./scripts/test/deploy-psm.sh $1