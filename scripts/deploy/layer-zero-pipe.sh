export LAYER_ZERO_ENDPOINT="0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1"
export TREASURY_ADDRESS="0x57A80C11413d4014B223687E07C827e8175F20e4"

# npx hardhat deploy --tags d2o,layer-zero-pipe --network fuji
# npx hardhat deploy --tags d2o,layer-zero-pipe --network sepolia


# sepolia to fuji
# npx hardhat lz-enroll-remote --remote-domain-id 10106 --remote-pipe-address 0x4e6AE3f1Aa290ecb392Daec7ADb1b3826Ffe677e --source-pipe-address 0x56c98a952B4eb9A8Ae02aAa595de0D44dE18e1e5 --network sepolia

# fuji to sepolia
# npx hardhat lz-enroll-remote --remote-domain-id 10161 --remote-pipe-address 0x56c98a952B4eb9A8Ae02aAa595de0D44dE18e1e5 --source-pipe-address 0x4e6AE3f1Aa290ecb392Daec7ADb1b3826Ffe677e --network fuji