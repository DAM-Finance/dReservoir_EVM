npx hardhat hyperlane-enroll-remote --network testOne --remote-domain-id 13372 --remote-pipe-address 0x0165878A594ca255338adfa4d48449f69242Eb8F
npx hardhat hyperlane-enroll-remote --network testTwo --remote-domain-id 13371 --remote-pipe-address 0x0165878A594ca255338adfa4d48449f69242Eb8F

npx hardhat hyperlane-enroll-validator --network testOne --remote-domain-id 13372 --remote-validator-address 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --threshold 1
npx hardhat hyperlane-enroll-validator --network testTwo --remote-domain-id 13371 --remote-validator-address 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --threshold 1
