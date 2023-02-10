# to set up multiple local networks, copy this script but for another network with a different port. This way we can have two networks standing up locally.

export MAILBOX_ADDRESS="0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"
export INTERCHAIN_GAS_PAYMASTER_ADDRESS="0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
export TREASURY_ADDRESS="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

npx hardhat deploy --network $1 --tags hyperlane-pipe