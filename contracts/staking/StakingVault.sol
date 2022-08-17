// SPDX-License-Identifier: MIT

//Inspiration from mSpell and DAM's own LMCV

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function lockedCollateral(address, bytes32) external view returns (uint256 amount);
}

interface ddPRIMELike{
    function balanceOf(address) external view returns (uint256 amount);
}

contract StakingVault {

    //
    // Authorisation.
    //

    mapping (address => uint256) public admins;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct RewardTokenData {
        uint256 totalRewardAmount;              // [wad] total amount of a specific reward token
        uint256 accumulatedRewardPerStaked;     // [ray] amount of reward per staked token
    }


    bytes32[]                                           public RewardTokenList;         // list of rewards tokens
    mapping (bytes32 => RewardTokenData)                public RewardData;

    mapping (address => mapping (bytes32 => uint256))   public rewardDebt;              // [wad] - amount already should've been paid out from time 0
    mapping (address => mapping (bytes32 => uint256))   public withdrawableRewards;     // [wad] - user can withdraw these rewards after unstaking

    mapping (address => uint256)                        public lockedStakeable;         // [wad] - staked amount per user
    mapping (address => uint256)                        public unlockedStakeable;       // [wad] - does not count towards staked tokens.
    mapping (address => uint256)                        public ddPrime;                 // [rad] - user's ddPRIME balance.

    uint256 public totalDDPrime;            // [rad] - Total amount of ddPRIME issued.
    uint256 public stakedAmount;            // [wad] - amount staked.
    uint256 public stakedAmountLimit;       // [wad] - max amount allowed to stake
    uint256 public stakedMintRatio;         // [ray] - ratio of staked tokens per ddPrime


    event EditRewardsToken(bytes32 indexed rewardToken, bool accepted, uint256 spot, uint256 position);
    event PullRewards(bytes32 indexed rewardToken, address indexed usr, uint256 wad);
    event MoveDDPrime(address indexed src, address indexed dst, uint256 rad);
    event PushRewards(bytes32 indexed rewardToken, uint256 wad);
    event RemoveRewards(bytes32 indexed rewardToken, uint256 wad);
    event UpdateRewards(bytes32 indexed rewardToken, uint256 ray);
    event PushStakingToken(address indexed user, uint256 amount);
    event PullStakingToken(address indexed user, uint256 amount);
    event Unstake(uint256 amount, address indexed user);
    event Stake(uint256 amount, address indexed user);
    event RewardSpotPrice(bytes32 indexed rewardToken, uint256 ray);
    event StakedMintRatio(uint256 ray);
    event StakedAmountLimit(uint256 wad);
    

    //
    // Admin.
    //

    uint256 public stakeLive;
    address public lmcv;
    bytes32 public ddPRIMEBytes;
    address public ddPRIMEContract;

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier stakeAlive() {
        require(stakeLive == 1, "LMCV/Loan paused");
        _;
    }


    constructor(bytes32 _ddPRIMEBytes, address _ddPRIMEContract, address _lmcv) {
        ddPRIMEBytes        = _ddPRIMEBytes;        // bytes32 of ddPRIME in LMCV for lookup in locked collateral list
        ddPRIMEContract     = _ddPRIMEContract;     // Address of ddPRIME for balance lookup
        lmcv                = _lmcv;
        stakeLive           = 1;
        admins[msg.sender]  = 1;
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

    function _add(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + uint256(y);
        }
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }

    function _int256(uint256 x) internal pure returns (int256 y) {
        require((y = int256(x)) >= 0);
    }

    //
    // Protocol Admin
    //

    function setStakedAmountLimit(uint256 wad) external auth {
        stakedAmountLimit = wad;
        emit StakedAmountLimit(wad);
    }

    function setStakedMintRatio(uint256 ray) external auth {
        stakedMintRatio = ray;
        emit StakedMintRatio(ray);
    }


    //
    // Rewards Admin
    //

    function pushRewards(bytes32 rewardToken, uint256 wad) external auth {
        require(stakedAmount != 0, "StakingVault/Staked amount must be greater than 0 to put rewards in");

        RewardTokenData storage tokenData = RewardData[rewardToken];
        tokenData.totalRewardAmount             += wad;
        tokenData.accumulatedRewardPerStaked    += wad * RAY / stakedAmount; // wad * RAY / wad = ray

        emit PushRewards(rewardToken, wad);
    }

    function editRewardsTokenList(bytes32 rewardToken, bool accepted, uint256 position) external auth {
        if(accepted){
            for (uint256 i = 0; i < RewardTokenList.length; i++) {
                require(RewardTokenList[i] != rewardToken, "StakingVault/Can't add reward token more than once");
            }
            RewardTokenList.push(rewardToken);
        }else{
            deleteElement(RewardTokenList, position);
        }
    }

    //
    // Stake Token User Functionality
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
    // Rewards User Functions
    //
    
    function pullRewards(bytes32 rewardToken, address usr, uint256 wad) external auth {
        // console.log("RT:  %s", bytes32ToString(rewardToken));
        // console.log("WAD: %s", wad);
        
        RewardTokenData storage tokenData = RewardData[rewardToken];
        // console.log("TRA: %s", tokenData.totalRewardAmount);
        // console.log("WR:  %s\n", withdrawableRewards[usr][rewardToken]);
        
        withdrawableRewards[usr][rewardToken]   -= wad;
        tokenData.totalRewardAmount             -= wad;
        emit PullRewards(rewardToken, usr, wad);
    }


    //
    // Main functionality
    //

    function stake(uint256 wad, address user) external stakeAlive { // [wad]
        require(approval(user, msg.sender), "StakingVault/Owner must consent");
        require(checkDDPrimeOwnership(user, lockedStakeable[user] * stakedMintRatio), "Need to own ddPRIME to cover locked amount otherwise reset");
        
        //1. Add locked tokens
        uint256 prevStakedAmount     = lockedStakeable[user]; //[wad]
        unlockedStakeable[user]     -= wad;
        lockedStakeable[user]       += wad;

        //2. Set reward debts for each token based on current time and staked amount
        for (uint256 i = 0; i < RewardTokenList.length; i++) {
            RewardTokenData storage tokenData = RewardData[RewardTokenList[i]];

            //Save prev reward debt and set new reward debt
            uint256 prevRewardDebt = rewardDebt[user][RewardTokenList[i]]; // [wad]
            rewardDebt[user][RewardTokenList[i]] = _rmul(lockedStakeable[user], tokenData.accumulatedRewardPerStaked); // rmul(wad, ray) = wad;

            //Pay out old rewards
            if(prevStakedAmount > 0){
                uint256 payout = _rmul(prevStakedAmount, tokenData.accumulatedRewardPerStaked) - prevRewardDebt; // rmul(wad,ray) - wad = wad;
                if(payout > 0){
                    withdrawableRewards[user][RewardTokenList[i]] += payout;
                }
            }
        }

        //3. Update total staked amounts
        stakedAmount    += wad;
        require(stakedAmount <= stakedAmountLimit, "StakingVault/Cannot be over staked token limit");

        //4. Set ddPrime
        totalDDPrime    += wad * stakedMintRatio;
        ddPrime[user]   += wad * stakedMintRatio;
        emit Stake(wad, user);
    }

    function unstake(uint256 wad, address user) external stakeAlive {
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        // require() history of stake
        
        emit Unstake(wad, user);
    }

    function liquidationWithdraw() external {

    }

    function forceRewardsReset(address user) external {
        require(approval(user, msg.sender), "StakingVault/Owner must consent");
        //For when user gets liquidated and cannot stake
    }

    //TODO: Make sure functions it relies on are view
    function checkDDPrimeOwnership(address user, uint256 rad) public view returns (bool ownership) {

        return LMCVLike(lmcv).lockedCollateral(user, ddPRIMEBytes) >= rad / RAY
            || ddPRIMELike(ddPRIMEContract).balanceOf(user) >= rad / RAY
            || ddPrime[user] >= rad
            ?  true
            :  false;
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

    //
    // Testing
    //

    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }

}