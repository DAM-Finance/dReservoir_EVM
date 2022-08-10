// SPDX-License-Identifier: AGPL-3.0-or-later

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.7;

contract StakingVault {

    //
    // Authorisation.
    //

    mapping (address => uint256) public admins;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct StakeToken {
        uint256 spotPrice;              // [ray] - dPrime (I.e. USD) price
        uint256 stakedAmount;           // [wad] - amount staked.
        uint256 stakedAmountLimit;      // [wad] - max amount allowed to stake
    }

    struct RewardToken {
        uint256 spotPrice;              // [ray] - dPrime (I.e. USD) price
        uint256 amount;                 // [wad] - current rewards in token amount
    }

    bytes32[] public StakeableTokens;
    bytes32[] public RewardTokens;

    mapping (bytes32 => StakeToken)                     public StakeableTokenData;
    mapping (bytes32 => RewardToken)                    public RewardTokenData;


    mapping (address => mapping (bytes32 => uint256))   public unlockedStakeable;      // [wad] - does not count towards portfolio valuation.
    mapping (address => mapping (bytes32 => uint256))   public withdrawableRewards;    // [wad] - user can withdraw these rewards from staking
    mapping (address => uint256)                        public ddPrime;                // [rad] - user's ddPRIME balance.

    uint256 public totalDDPrime;            // [rad] - Total amount of ddPRIME issued.





    //
    // Admin.
    //

    uint256 public stakeLive;

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier stakeAlive() {
        require(stakeLive == 1, "LMCV/Loan paused");
        _;
    }


    constructor() {
        stakeLive = 1;
        admins[msg.sender] = 1;
    }

    //
    // Authorisation.
    //

    function administrate(address admin, uint256 authorization) external auth {
        admins[admin] = authorization;
    }

    function approveMultiple(address[] memory users) external {
        for(uint256 i = 0; i < users.length; i++){
            approve(users[i]);
        }
    }
    function approve(address user) public {
        proxyApprovals[msg.sender][user] = 1;
    }

    function disapproveMultiple(address[] memory users) external {
        for(uint256 i = 0; i < users.length; i++){
            disapprove(users[i]);
        }
    }
    function disapprove(address user) public {
        proxyApprovals[msg.sender][user] = 0;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
    }


    //
    // Math.
    //

    uint256 constant RAY = 10 ** 27;
    // Can only be used sensibly with the following combination of units:
    // - `rmul(wad, ray) -> wad`
    // - `rmul(ray, ray) -> ray`
    // - `rmul(rad, ray) -> rad`
    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }



    function stake(bytes32 stakeableToken, uint256 amount, address user) external stakeAlive {
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        //Staked token is added to locked list 




        // ddPrime is mintable based on a ratio that is divided by an increasing normal ie opposite of normalDebt/dPrime

    }

    function unstake(bytes32 stakeableToken, uint256 amount, address user) external stakeAlive {
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        

    }


    //
    // Helpers
    //

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

}