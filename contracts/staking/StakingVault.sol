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


    struct RewardToken {
        uint256 spotPrice;              // [ray] - dPrime (I.e. USD) price
        uint256 amount;                 // [wad] - current rewards in token amount
    }

    bytes32[] public RewardTokens;
    mapping (bytes32 => RewardToken)                    public RewardTokenData;


    mapping (address => mapping (bytes32 => uint256))   public rewardDebt;              // [wad] - amount already should've been paid out from time 0
    mapping (address => mapping (bytes32 => uint256))   public withdrawableRewards;     // [wad] - user can withdraw these rewards after unstaking

    mapping (address => uint256)                        public lockedStakeable;
    mapping (address => uint256)                        public unlockedStakeable;       // [wad] - does not count towards staked tokens.
    mapping (address => uint256)                        public ddPrime;                 // [rad] - user's ddPRIME balance.

    uint256 public totalDDPrime;           // [rad] - Total amount of ddPRIME issued.
    uint256 public stakedAmount;           // [wad] - amount staked.
    uint256 public stakedAmountLimit;      // [wad] - max amount allowed to stake


    event EditRewardsToken(bytes32 indexed rewardToken, bool accepted, uint256 spot, uint256 position);
    event PullRewards(bytes32 indexed rewardToken, address indexed usr, uint256 wad);
    event MoveDDPrime(address indexed src, address indexed dst, uint256 rad);
    event PushRewards(bytes32 indexed rewardToken, uint256 wad);
    event RemoveRewards(bytes32 indexed rewardToken, uint256 wad);
    event PushStakingToken(address indexed user, uint256 amount);
    event PullStakingToken(address indexed user, uint256 amount);
    event Unstake(uint256 amount, address indexed user);
    event Stake(uint256 amount, address indexed user);
    event RewardSpotPrice(bytes32 indexed rewardToken, uint256 ray);
    event StakedSpotPrice(uint256 ray);
    event StakedAmountLimit(uint256 wad);
    

    //
    // Admin.
    //

    uint256 public stakeLive;
    address public lmcv;

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier stakeAlive() {
        require(stakeLive == 1, "LMCV/Loan paused");
        _;
    }


    constructor(address _lmcv) {
        lmcv = _lmcv;
        stakeLive = 1;
        admins[msg.sender] = 1;
    }

    //
    // Authorisation.
    //

    function administrate(address admin, uint256 authorization) external auth {
        admins[admin] = authorization;
    }

    function approve(address user) public {
        proxyApprovals[msg.sender][user] = 1;
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

    //
    // Protocol Admin
    //

    function setStakedAmountLimit(uint256 wad) external auth {
        stakedAmountLimit = wad;
        emit StakedAmountLimit(wad);
    }


    //
    // Rewards Admin
    //

    function updatedRewardSpotPrice(bytes32 rewardToken, uint256 ray) external auth {
        RewardTokenData[rewardToken].spotPrice = ray;
        emit RewardSpotPrice(rewardToken, ray);
    }

    //If deprecated, admin can remove rewards
    function removeRewards(bytes32 rewardToken, uint256 wad) external auth {
        RewardToken storage tokenData = RewardTokenData[rewardToken];
        tokenData.amount -= wad;
        emit RemoveRewards(rewardToken, wad);
    }

    function editRewardsToken(bytes32 rewardToken, bool accepted, uint256 ray, uint256 position) external auth {
        RewardToken memory tokenData = RewardTokenData[rewardToken];
        tokenData.spotPrice = ray;
        RewardTokenData[rewardToken] = tokenData;

        if(accepted){
            RewardTokens.push(rewardToken);
        }else{
            tokenData.spotPrice = 0;
            deleteElement(RewardTokens, position);
        }
    }

    //
    // Unlocked Stake Token Functionality
    //

    function pushStakingToken(address user, uint256 wad) external auth {
        unlockedStakeable[user] += wad;
        emit PushStakingToken(user, wad);
    }

    function pullStakingToken(address user, uint256 wad) external auth {
        unlockedStakeable[user] -= wad;
        emit PullStakingToken(user, wad);
    }

    //
    // ddPrime
    //

    function moveDDPrime(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "StakingVault/ddPrime move not allowed");
        ddPrime[src] -= rad;
        ddPrime[dst] += rad;
        emit MoveDDPrime(src, dst, rad);
    }

    //
    // Rewards Functions
    //

    //Admin pushes rewards to contract
    function pushRewards(bytes32 rewardToken, uint256 wad) external auth {
        RewardToken storage tokenData = RewardTokenData[rewardToken];
        require(tokenData.spotPrice > 0, "StakingVault/Token must be initialized");
        tokenData.amount += wad;
        emit PushRewards(rewardToken, wad);
    }

    //Average user can pull their own rewards
    function pullRewards(bytes32 rewardToken, address usr, uint256 wad) external auth {
        RewardToken storage tokenData = RewardTokenData[rewardToken];
        withdrawableRewards[usr][rewardToken] -= wad;
        tokenData.amount -= wad;
        emit PullRewards(rewardToken, usr, wad);
    }


    //
    // Main functionality
    //

    function stake(uint256 wad, address user) external stakeAlive { // [wad]
        require(approval(user, msg.sender), "StakingVault/Owner must consent");



        emit Stake(wad, user);
    }

    function unstake(uint256 wad, address user) external stakeAlive {
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        // require() history of stake
        
        emit Unstake(wad, user);
    }

    function liquidationWithdraw() external {

    }

    

    //
    // Helpers
    //

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

     //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }

}